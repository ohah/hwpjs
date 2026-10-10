//! Resolve real header IDs, prepare owned values and validate full output before commit.
const std = @import("std");
const editor = @import("editor_session.zig");
const Mode = enum { validate, commit, transaction };
pub fn apply(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32) !bool {
    return prepare(session, section_index, paragraph_index, start, end, id, .commit, null);
}

pub fn validate(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32) !void {
    _ = try prepare(session, section_index, paragraph_index, start, end, id, .validate, null);
}

/// Internal transaction step: caller owns rollback and final full save validation.
/// Resource IDs must come from the validated original inventory plus intents.
pub fn applyInTransaction(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32, ids: []const u32) !bool {
    return prepare(session, section_index, paragraph_index, start, end, id, .transaction, ids);
}

fn prepare(session: *editor.Session, section_index: usize, paragraph_index: usize, start: u32, end: u32, id: u32, mode: Mode, provided_ids: ?[]const u32) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (section.structure_values != null and section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    if (paragraph_index < section.first_paragraph or paragraph_index > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = session.allocator;
    const owned_ids = if (provided_ids == null) try @import("character_style_resources.zig").ids(session) else null;
    defer if (owned_ids) |ids| a.free(ids);
    const ids = provided_ids orelse owned_ids.?;
    if (std.mem.indexOfScalar(u32, ids, id) == null) return error.InvalidResourceReference;
    var counters: @import("section_text.zig").Report = .{ .paragraphs = section.source_first_paragraph orelse section.first_paragraph };
    counters.paragraphs -= 1;
    var values = if (section.structure_values) |*current|
        try current.clone(a)
    else
        try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    var transferred = false;
    defer if (!transferred) values.deinit(a);
    if (try @import("formula_section_save.zig").hasFormula(a, &section.tree)) try @import("character_style_formula_current.zig").prepare(session, section_index, &values, paragraph_index);
    const paragraph = &values.paragraphs[paragraph_index - section.first_paragraph];
    const positions = if (paragraph.field_positions != null)
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
        break :block try @import("paragraph_text_positions.zig").build(a, &section.tree, &paragraph.sites, locations, 1);
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
    const original = if (has_anchors) block: {
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
    defer a.free(original);
    const current = paragraph.character_styles orelse original;
    const painted = if (has_anchors)
        try @import("character_style_paint.zig").prepare(a, &paragraph.sites, current, start, end, id, ids, session.options.max_sites)
    else if (has_tabs) block: {
        const typed = try @import("character_style_tab_adapter.zig").toTyped(a, current);
        defer a.free(typed);
        const selected = try @import("character_style_tab_paint.zig").prepare(a, &paragraph.sites, typed, start, end, id, ids, session.options.max_sites);
        defer a.free(selected);
        break :block try @import("character_style_tab_adapter.zig").fromTyped(a, &section.tree, &paragraph.sites, selected);
    } else try @import("character_style_paint.zig").prepare(a, &paragraph.sites, current, start, end, id, ids, session.options.max_sites);
    var installed = false;
    defer if (!installed) a.free(painted);
    if (mode == .validate) return false;
    var same = painted.len == current.len;
    if (same) for (painted, current) |one, two| {
        if (!std.meta.eql(one, two)) same = false;
    };
    if (same) return false;
    if (paragraph.character_styles) |styles| a.free(styles);
    paragraph.character_styles = painted;
    installed = true;
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
    if (section.structure_values) |*old| old.deinit(a);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = values;
    transferred = true;
    committed_empty = true;
    return true;
}
