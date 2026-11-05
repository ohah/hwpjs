//! Resolve real header IDs, prepare owned values and validate full output before commit.
const std = @import("std");
const editor = @import("editor_session.zig");
const Mode = enum { validate, commit, transaction };
pub fn apply(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32) !bool {
    return prepare(session, section_index, paragraph_index, start, end, id, .commit, null);
}

/// Formatting-patch caller owns the outer rollback and one final save.
pub fn applyDeferred(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32) !bool {
    return prepare(session, section_index, paragraph_index, start, end, id, .transaction, null);
}

pub fn validate(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32) !void {
    if (session.formatting_batch) |context| if (!context.dirty_sections.contains(section_index)) {
        errdefer context.invalidateSections();
        if (section_index >= session.sections.len) return error.InvalidSectionIndex;
        const section = &session.sections[section_index];
        if (section.structure_values != null and section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        if (paragraph_index < section.first_paragraph or paragraph_index > section.last_paragraph) return error.InvalidParagraphIndex;
        if (context.validation == null) context.validation = .{ .allocator = session.allocator };
        const query = &context.validation.?;
        try query.prepareIDs(session);
        if (query.sections.contains(section_index)) return query.validate(session, section_index, paragraph_index, start, end, id, &.{});
        var view = try @import("display_current_paragraphs.zig").read(session.allocator, section, session.options);
        defer view.deinit(session.allocator);
        return query.validate(session, section_index, paragraph_index, start, end, id, view.paragraphs);
    };
    _ = try prepare(session, section_index, paragraph_index, start, end, id, .validate, null);
}

/// Internal transaction step: caller owns rollback and final full save validation.
/// Resource IDs must come from the validated original inventory plus intents.
pub fn applyInTransaction(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32, ids: []const u32) !bool {
    return prepare(session, section_index, paragraph_index, start, end, id, .transaction, ids);
}

fn prepare(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32, mode: Mode, provided_ids: ?[]const u32) !bool {
    errdefer if (session.formatting_batch) |context| context.invalidateSections();
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (section.structure_values != null and section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    if (paragraph_index < section.first_paragraph or paragraph_index > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = session.allocator;
    const owned_ids = if (provided_ids == null and session.formatting_batch == null) try @import("character_style_resources.zig").ids(session) else null;
    defer if (owned_ids) |ids| a.free(ids);
    const single_id = [_]u32{id};
    // The canonical paint functions only test membership of the selected ID.
    // Its complete current inventory check stays at this original validation phase.
    const ids = if (session.formatting_batch != null) block: {
        if (!try @import("character_style_resources.zig").batchContains(session, id)) return error.InvalidResourceReference;
        break :block &single_id;
    } else provided_ids orelse owned_ids.?;
    if (std.mem.indexOfScalar(u32, ids, id) == null) return error.InvalidResourceReference;
    var counters: @import("section_text.zig").Report = .{ .paragraphs = section.source_first_paragraph orelse section.first_paragraph };
    counters.paragraphs -= 1;
    // Only the formatting-patch context may borrow an already installed section.
    // The exact buffer identity makes checkpoint rollback retire this receipt.
    const borrowed = mode != .commit and session.formatting_batch != null and section.structure_values != null and session.formatting_batch.?.canBorrow(section_index, &section.structure_values.?);
    var values = if (borrowed)
        section.structure_values.?
    else if (section.structure_values) |*current|
        try current.clone(a)
    else
        try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    if (session.formatting_batch) |context| {
        if (borrowed) context.section_borrows += 1 else context.section_copies += 1;
    }
    var transferred = false;
    defer if (!transferred and !borrowed) values.deinit(a);
    const has_formula = if (borrowed) false else try @import("formula_section_save.zig").hasFormula(a, &section.tree);
    if (has_formula) try @import("character_style_formula_current.zig").prepare(session, section_index, &values, paragraph_index);
    const paragraph = &values.paragraphs[paragraph_index - section.first_paragraph];
    if (!borrowed and paragraph.synthesized_run_character_id == null) try @import("character_style_field_positions.zig").retain(session, section_index, &values);
    const prepared = try buildStyles(session, section_index, paragraph);
    defer a.free(prepared.original);
    const current = prepared.current;
    const painted = try paintStyles(session, section_index, paragraph, prepared, start, end, id, ids);
    var installed = false;
    defer if (!installed) a.free(painted);
    if (mode == .validate) return false;
    var same = painted.len == current.len;
    if (same) for (painted, current) |one, two| {
        if (!std.meta.eql(one, two)) same = false;
    };
    if (same) return false;
    if (session.formatting_batch) |context| try context.dirty_sections.put(a, section_index, {});
    try @import("title_derived_gap.zig").prepareFormat(&section.tree, paragraph, painted);
    if (paragraph.character_styles) |styles| a.free(styles);
    paragraph.character_styles = painted;
    installed = true;
    const title_owners = try @import("title_fragment_owner.zig").prepare(a, &section.tree, paragraph, painted);
    if (paragraph.title_fragment_owners) |old| a.free(old);
    paragraph.title_fragment_owners = title_owners;
    try @import("title_fragment_identity.zig").assign(paragraph, painted);
    const title_output = try @import("title_output_projection.zig").prepare(a, &section.tree, paragraph, editor.siteOptions(session.options), session.options.max_xml_bytes);
    if (paragraph.title_output_projection) |*old| old.deinit(a);
    paragraph.title_output_projection = title_output;
    const empty = try a.alloc(@import("text_sites.zig").Site, 0);
    var committed_empty = false;
    defer if (!committed_empty) a.free(empty);
    if (mode == .commit) {
        const sections = try a.dupe(editor.Section, session.sections);
        defer a.free(sections);
        sections[section_index].structure_values = values;
        sections[section_index].sites = .{ .items = empty };
        var candidate = session.*;
        candidate.sections = sections;
        const output = try candidate.save();
        defer a.free(output);
    }
    // Transaction callers perform final output validation before returning.
    if (!borrowed) {
        if (section.structure_values) |*old| old.deinit(a);
        section.sites.deinit(a);
        section.sites = .{ .items = empty };
        section.structure_values = values;
        transferred = true;
        committed_empty = true;
    }
    // Formula preparation is paragraph-specific and is deliberately not borrowed.
    if (!has_formula) if (session.formatting_batch) |context| try context.prepared(a, section_index, &section.structure_values.?);
    return true;
}

pub const PreparedStyles = struct {
    original: []@import("character_style_paint.zig").Span,
    current: []const @import("character_style_paint.zig").Span,
    has_tabs: bool,
    has_anchors: bool,
    validated_id: ?u32 = null,
    boundaries: ?@import("character_style_paint.zig").ValidatedPlainBoundaries = null,
    boundary_declined: bool = false,
};
fn buildStyles(session: *editor.Session, section_index: usize, paragraph: *@import("paragraph_structure_values.zig").Paragraph) !PreparedStyles {
    const a = session.allocator;
    const section = &session.sections[section_index];
    const synthesized = paragraph.synthesized_run_character_id != null;
    const positions = if (synthesized)
        try a.alloc(@import("paragraph_text_positions.zig").Segment, 0)
    else if (paragraph.field_positions != null)
        try @import("field_owned_positions.zig").build(a, &section.tree, paragraph)
    else if (paragraph.protected_positions != null)
        try @import("paragraph_protected_positions.zig").build(a, &section.tree, paragraph)
    else if (paragraph.joined()) |view|
        try @import("paragraph_joined_positions.zig").build(a, &section.tree, &view)
    else block: {
        const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, paragraph);
        defer a.free(locations);
        @import("plain_paragraph_policy.zig").validateForCharacterFormat(&section.tree, &paragraph.sites, locations, 1) catch |err| switch (err) {
            error.UnsupportedParagraphControl => break :block try @import("anchor_paragraph_edit.zig").segments(a, &section.tree, &paragraph.sites, locations, 1),
            else => return err,
        };
        // The successful character-format policy already admits retained field controls.
        // Keep their zero-width axis when a titleMark is present.
        break :block try @import("paragraph_text_positions.zig").buildForFieldText(a, &section.tree, &paragraph.sites, locations, 1);
    };
    defer a.free(positions);
    var has_tabs = false;
    var has_anchors = false;
    for (positions) |position| if (position.kind == .anchor) {
        has_anchors = true;
    };
    for (positions) |position| if (@import("paragraph_text_positions.zig").isInlineUnit(position)) {
        has_tabs = true;
    };
    const original = if (synthesized)
        try @import("runless_paragraph_current.zig").baseStyles(a, &section.tree, paragraph)
    else if (has_anchors) block: {
        const typed = try @import("character_style_anchor_projection.zig").build(a, &section.tree, &paragraph.sites, positions, session.options.max_sites);
        defer a.free(typed);
        break :block try @import("character_style_anchor_adapter.zig").fromTyped(a, &section.tree, &paragraph.sites, typed);
    } else if (has_tabs) block: {
        const typed = try @import("character_style_tab_projection.zig").build(a, &section.tree, &paragraph.sites, positions, session.options.max_sites);
        defer a.free(typed);
        break :block try @import("character_style_tab_adapter.zig").fromTyped(a, &section.tree, &paragraph.sites, typed);
    } else block: {
        const projection = try @import("character_style_projection.zig").build(a, &section.tree, &paragraph.sites, positions, session.options.max_sites);
        defer a.free(projection);
        break :block try @import("character_style_paint.zig").fromProjection(a, projection, session.options.max_sites);
    };
    return .{ .original = original, .current = paragraph.character_styles orelse original, .has_tabs = has_tabs, .has_anchors = has_anchors };
}
fn paintStyles(session: *editor.Session, section_index: usize, paragraph: *@import("paragraph_structure_values.zig").Paragraph, prepared: PreparedStyles, start: u32, end: u32, id: u32, ids: []const u32) ![]@import("character_style_paint.zig").Span {
    const a = session.allocator;
    const section = &session.sections[section_index];
    const current = prepared.current;
    const has_tabs = prepared.has_tabs;
    const has_anchors = prepared.has_anchors;
    return if (has_anchors)
        try @import("character_style_paint.zig").prepare(a, &paragraph.sites, current, start, end, id, ids, session.options.max_sites)
    else if (has_tabs) block: {
        const typed = try @import("character_style_tab_adapter.zig").toTyped(a, current);
        defer a.free(typed);
        const selected = try @import("character_style_tab_paint.zig").prepare(a, &paragraph.sites, typed, start, end, id, ids, session.options.max_sites);
        defer a.free(selected);
        break :block try @import("character_style_tab_adapter.zig").fromTyped(a, &section.tree, &paragraph.sites, selected);
    } else try @import("character_style_paint.zig").prepare(a, &paragraph.sites, current, start, end, id, ids, session.options.max_sites);
}

/// Request-lifetime readonly preparation. Never installs values into Session.
pub const QueryValidation = struct {
    allocator: std.mem.Allocator,
    ids: ?[]u32 = null,
    id_set: std.AutoHashMapUnmanaged(u32, void) = .empty,
    sections: std.AutoHashMapUnmanaged(usize, Section) = .empty,
    styles: std.AutoHashMapUnmanaged(@import("../model/formatting_patch.zig").Owner, PreparedStyles) = .empty,
    snapshots: std.AutoHashMapUnmanaged(@import("../model/formatting_patch.zig").Owner, []@import("character_style_display_ranges.zig").Range) = .empty,
    source_index: ?@import("character_style_snapshot.zig").SourceIndex = null,
    section_builds: usize = 0,
    paragraph_reads: usize = 0,
    const Section = struct { values: @import("paragraph_structure_values.zig").Values, has_formula: bool, fields_retained: bool = false };
    pub fn deinit(self: *QueryValidation) void {
        var styles = self.styles.valueIterator();
        while (styles.next()) |value| {
            if (value.boundaries) |*boundaries| boundaries.deinit(self.allocator);
            self.allocator.free(value.original);
        }
        self.styles.deinit(self.allocator);
        var snapshots = self.snapshots.valueIterator();
        while (snapshots.next()) |value| self.allocator.free(value.*);
        self.snapshots.deinit(self.allocator);
        var sections = self.sections.valueIterator();
        while (sections.next()) |value| value.values.deinit(self.allocator);
        self.sections.deinit(self.allocator);
        if (self.source_index) |*index| index.deinit();
        if (self.ids) |ids| self.allocator.free(ids);
        self.id_set.deinit(self.allocator);
    }
    fn prepareIDs(self: *QueryValidation, session: *editor.Session) !void {
        if (self.ids == null) {
            const ids = try @import("character_style_resources.zig").ids(session);
            self.ids = ids;
            for (ids) |resource| try self.id_set.put(self.allocator, resource, {});
        }
    }
    pub fn readSpans(self: *QueryValidation, session: *editor.Session, section: usize, paragraph: usize) ![]const @import("character_style_display_ranges.zig").Range {
        const owner = @import("../model/formatting_patch.zig").Owner{ .section = section, .paragraph = paragraph };
        if (self.snapshots.get(owner)) |spans| return spans;
        if (self.source_index == null) self.source_index = .{ .allocator = self.allocator };
        const spans = try @import("character_style_snapshot.zig").readScoped(session, section, paragraph, &self.source_index.?);
        errdefer self.allocator.free(spans);
        try self.snapshots.put(self.allocator, owner, spans);
        self.paragraph_reads += 1;
        return spans;
    }
    pub fn validate(self: *QueryValidation, session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32, source: []const @import("paragraph_structure_values.zig").Paragraph) !void {
        if (section_index >= session.sections.len) return error.InvalidSectionIndex;
        const section = &session.sections[section_index];
        if (section.structure_values != null and section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        if (paragraph_index < section.first_paragraph or paragraph_index > section.last_paragraph) return error.InvalidParagraphIndex;
        try self.prepareIDs(session);
        if (!self.id_set.contains(id)) return error.InvalidResourceReference;
        if (!self.sections.contains(section_index)) {
            const borrowed: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = @constCast(source) };
            var values = try borrowed.clone(self.allocator);
            errdefer values.deinit(self.allocator);
            const formula = try @import("formula_section_save.zig").hasFormula(self.allocator, &section.tree);
            try self.sections.put(self.allocator, section_index, .{ .values = values, .has_formula = formula });
            self.section_builds += 1;
        }
        const owned = self.sections.getPtr(section_index).?;
        const key = @import("../model/formatting_patch.zig").Owner{ .section = section_index, .paragraph = paragraph_index };
        if (!self.styles.contains(key)) {
            if (owned.has_formula) try @import("character_style_formula_current.zig").prepare(session, section_index, &owned.values, paragraph_index);
            const paragraph = &owned.values.paragraphs[paragraph_index - section.first_paragraph];
            if (paragraph.synthesized_run_character_id == null and !owned.fields_retained) {
                try @import("character_style_field_positions.zig").retain(session, section_index, &owned.values);
                owned.fields_retained = true;
            }
            const prepared = try buildStyles(session, section_index, paragraph);
            errdefer self.allocator.free(prepared.original);
            try self.styles.put(self.allocator, key, prepared);
        }
        const paragraph = &owned.values.paragraphs[paragraph_index - section.first_paragraph];
        const prepared = self.styles.getPtr(key).?;
        if (prepared.validated_id == id and !prepared.has_tabs and !prepared.has_anchors and !prepared.boundary_declined) {
            if (prepared.boundaries == null) {
                prepared.boundaries = try @import("character_style_paint.zig").afterValidatedPlain(self.allocator, &paragraph.sites, prepared.current, session.options.max_sites);
                if (prepared.boundaries == null) prepared.boundary_declined = true;
            }
            if (prepared.boundaries) |*boundaries| return boundaries.validate(start, end);
        }
        const painted = try paintStyles(session, section_index, paragraph, prepared.*, start, end, id, &.{id});
        self.allocator.free(painted);
        prepared.validated_id = id;
    }
};
