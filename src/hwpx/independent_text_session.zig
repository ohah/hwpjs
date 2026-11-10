//! Scoped Native integration into existing Session values and History owner.
//! No serializer/checkpoint/authority cache. Candidate Values are the existing model.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");
const Command = @import("editor_history.zig").Command;
const Edit = @import("../model/independent_text_edits.zig").Edit;
const Segment = @import("paragraph_text_positions.zig").Segment;
const Span = @import("character_style_paint.zig").Span;
const xml = @import("document_xml.zig");
const Range = struct { start: usize, end: usize };
const Flags = struct { field: bool = false, title: bool = false, page: bool = false, tracked: bool = false, column_at: ?usize = null };
const SectionDraft = struct {
    values: model.Values,
    flags: []Flags,
    original_values: ?[*]model.Paragraph,
    original_sites: [*]@import("text_sites.zig").Site,
    digest: u64,
    changed: bool = false,
    empty: ?[]@import("text_sites.zig").Site = null,
};
pub const Context = struct {
    pub const Work = struct { global_sites: usize = 0, section_builds: usize = 0, nodes: usize = 0, paragraphs: usize = 0, edits: usize = 0 };

    session: *editor.Session,
    source: [*]u8,
    serial: u64,
    active: bool,
    section_pointer: [*]editor.Section,
    total_bytes: usize,
    options: editor.Options,
    global_digests: []u64,
    fields: [][]Range,
    drafts: std.AutoHashMapUnmanaged(usize, SectionDraft) = .empty,
    consumed: bool = false,
    resource_ids: ?[]u32 = null,
    resource_set: std.AutoHashMapUnmanaged(u32, void) = .empty,
    // Request work counters describe actual source/candidate preparation, not a grant.
    work: if (@import("builtin").is_test) Work else void = if (@import("builtin").is_test) .{} else {},
    pub fn init(session: *editor.Session) !Context {
        const a = session.allocator;
        var self: Context = .{ .session = session, .source = session.source.ptr, .serial = session.mutation_serial, .active = session.history_transaction_active, .section_pointer = session.sections.ptr, .total_bytes = 0, .options = session.options, .global_digests = &.{}, .fields = try a.alloc([]Range, session.sections.len) };
        @memset(self.fields, &.{});
        errdefer {
            for (self.fields) |rows| a.free(rows);
            a.free(self.fields);
        }
        if (@import("created_table_host_splice.zig").hasPending(session)) return error.UnsupportedIndependentCreatedTableMetadata;
        self.global_digests = try a.alloc(u64, session.sections.len);
        errdefer a.free(self.global_digests);
        for (session.sections, self.global_digests) |section, *seal| {
            try validateOwnership(&section);
            seal.* = digest(&section);
            self.total_bytes = std.math.add(usize, self.total_bytes, try section.textBytes(session.options.max_text_bytes -| self.total_bytes)) catch return error.LimitExceeded;
            if (section.structure_values) |values| {
                for (values.paragraphs) |paragraph| {
                    if (@import("builtin").is_test) self.work.global_sites += paragraph.sites.items.len;
                }
            } else {
                if (@import("builtin").is_test) self.work.global_sites += section.sites.items.len;
            }
        }
        var analysis = try @import("source_field_analysis.zig").leaseForExterior(session);
        defer analysis.deinit(a);
        const buckets = try a.alloc(std.ArrayList(Range), session.sections.len);
        defer a.free(buckets);
        @memset(buckets, .empty);
        defer for (buckets) |*bucket| bucket.deinit(a);
        for (analysis.source.fields) |field| {
            const begin = analysis.source.report.markers[field.begin_marker];
            const end = analysis.source.report.markers[field.end_marker];
            try buckets[field.section].append(a, .{ .start = begin.element_index, .end = end.element_index + 1 });
        }
        for (analysis.source.report.markers) |marker| if (marker.kind == .begin and marker.matched_marker_index == null) {
            const tree = &session.sections[marker.section_ordinal].tree;
            const envelope = try @import("field_source_scope.zig").forBegin(tree, marker.element_index);
            var low: usize = marker.element_index;
            var high = tree.elements.len;
            while (low < high) {
                const mid = low + (high - low) / 2;
                if (tree.elements[mid].start_tag.start < envelope.end) low = mid + 1 else high = mid;
            }
            try buckets[marker.section_ordinal].append(a, .{ .start = marker.element_index, .end = low });
        };
        for (buckets, self.fields) |*bucket, *rows| rows.* = try bucket.toOwnedSlice(a);
        return self;
    }
    pub fn deinit(self: *Context) void {
        const a = self.session.allocator;
        var values = self.drafts.valueIterator();
        while (values.next()) |draft| {
            draft.values.deinit(a);
            a.free(draft.flags);
            if (draft.empty) |rows| a.free(rows);
        }
        self.drafts.deinit(a);
        if (self.resource_ids) |ids| a.free(ids);
        self.resource_set.deinit(a);
        for (self.fields) |rows| a.free(rows);
        a.free(self.fields);
        a.free(self.global_digests);
        self.* = undefined;
    }
    fn check(self: *const Context) !void {
        const s = self.session;
        if (self.consumed or s.source.ptr != self.source or s.sections.ptr != self.section_pointer or s.sections.len != self.fields.len or s.mutation_serial != self.serial or s.history_transaction_active != self.active or !std.meta.eql(s.options, self.options)) return error.StaleIndependentTextContext;
    }
    fn getSection(self: *Context, index: usize) !*SectionDraft {
        try self.check();
        if (index >= self.session.sections.len) return error.InvalidSectionIndex;
        if (self.drafts.getPtr(index)) |draft| return draft;
        const s = self.session;
        const a = s.allocator;
        const original = &s.sections[index];
        try original.validateSourceBasis();
        if (original.structure_values != null and original.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        var report: @import("section_text.zig").Report = .{ .paragraphs = (original.source_first_paragraph orelse original.first_paragraph) - 1 };
        var values = if (original.structure_values) |*v| try v.clone(a) else try @import("paragraph_structure_collect.zig").collect(a, &original.tree, &original.sites, original.locations, editor.siteOptions(s.options), &report);
        errdefer values.deinit(a);
        const flags = try self.policy(index);
        errdefer a.free(flags);
        try self.drafts.put(a, index, .{ .values = values, .flags = flags, .original_values = if (original.structure_values) |v| v.paragraphs.ptr else null, .original_sites = original.sites.items.ptr, .digest = digest(original) });
        if (@import("builtin").is_test) self.work.section_builds += 1;
        return self.drafts.getPtr(index).?;
    }
    fn policy(self: *Context, section_index: usize) ![]Flags {
        const a = self.session.allocator;
        const tree = &self.session.sections[section_index].tree;
        const flags = try a.alloc(Flags, tree.elements.len);
        errdefer a.free(flags);
        @memset(flags, .{});
        const owner = try a.alloc(?usize, tree.elements.len);
        defer a.free(owner);
        const diff = try a.alloc(isize, tree.elements.len + 1);
        defer a.free(diff);
        @memset(diff, 0);
        for (self.fields[section_index]) |field| {
            if (field.start >= field.end or field.end > tree.elements.len) return error.SourceBindingMismatch;
            diff[field.start] += 1;
            diff[field.end] -= 1;
        }
        var active: isize = 0;
        for (tree.elements, 0..) |element, i| {
            if (@import("builtin").is_test) self.work.nodes += 1;
            active += diff[i];
            if (element.parent) |parent| {
                if (parent >= i) return error.SourceBindingMismatch;
                owner[i] = owner[parent];
            } else owner[i] = null;
            if (element.is(xml.paragraph_uri, "p")) owner[i] = i;
            const paragraph = owner[i] orelse continue;
            const f = &flags[paragraph];
            if (active != 0 or element.is(xml.paragraph_uri, "fieldBegin") or element.is(xml.paragraph_uri, "fieldEnd")) f.field = true;
            if (element.is(xml.paragraph_uri, "titleMark") or element.is(xml.paragraph_uri, "bookmark") or element.is(xml.paragraph_uri, "autoNum")) f.title = true;
            if (element.is(xml.paragraph_uri, "header") or element.is(xml.paragraph_uri, "footer") or element.is(xml.paragraph_uri, "pageNum") or element.is(xml.paragraph_uri, "newNum")) f.page = true;
            if (element.is(xml.paragraph_uri, "colPr")) f.column_at = if (f.column_at) |old| @min(old, element.start_tag.start) else element.start_tag.start;
            if (element.is(xml.paragraph_uri, "p") or element.is(xml.paragraph_uri, "run")) {
                for ([_][]const u8{ "paraTcId", "charTcId" }) |name| if (try tree.attributeValue(a, i, "", name)) |raw| {
                    const bytes = try raw.toUtf8(a, 4096);
                    defer a.free(bytes);
                    if (!(@import("xml_values.zig").nonNegative(bytes) catch false)) f.tracked = true;
                };
                if (element.is(xml.paragraph_uri, "p")) if (try tree.attributeValue(a, i, "", "merged")) |raw| {
                    const bytes = try raw.toUtf8(a, 4096);
                    defer a.free(bytes);
                    if (@import("xml_values.zig").boolean(bytes) catch true) f.tracked = true;
                };
            }
        }
        return flags;
    }
    fn authorize(_: *const Context, draft: *const SectionDraft, paragraph: *const model.Paragraph) !void {
        try authorizePart(draft, paragraph);
        if (paragraph.field_positions != null) return error.UnsupportedIndependentFieldMetadata;
        if (paragraph.title_output_projection != null or paragraph.title_fragment_owners != null or (paragraph.title_positions != null and paragraph.title_positions.?.len != 0)) return error.UnsupportedIndependentTitleMetadata;
        if (paragraph.page_area_positions != null and paragraph.page_area_positions.?.len != 0) return error.UnsupportedIndependentPageMetadata;
        if (paragraph.column_boundaries) |rows| if (rows.len != 0) return error.UnsupportedIndependentColumnMetadata;
        if (paragraph.synthesized_run_character_id != null or paragraph.sites.items.len == 0) return error.UnsupportedIndependentRunlessParagraph;
        if (paragraph.joined()) |joined| {
            try joined.validate();
            for (joined.pieces, 0..) |piece, i| {
                if (piece.output != .current_runs or piece.template_only) return error.UnsupportedIndependentHiddenPiece;
                const part = try joined.paragraph(i);
                try authorizePart(draft, &part);
            }
        }
    }
    pub fn apply(self: *Context, section_index: usize, paragraph_index: usize, edits: []const Edit) !bool {
        return (try self.prepareTarget(section_index, paragraph_index, null, edits)).changed;
    }
    /// Read current Native axis and validate the same source policy as apply.
    /// Candidates belong to this Context; no live Values are installed here.
    pub fn inspect(self: *Context, section_index: usize, paragraph_index: usize) !u32 {
        return (try self.prepareTarget(section_index, paragraph_index, null, &.{})).before_units;
    }
    pub fn preflight(self: *Context, section_index: usize, paragraph_index: usize, before_units: u32, edits: []const Edit) !void {
        _ = try self.prepareTarget(section_index, paragraph_index, before_units, edits);
    }
    const TargetResult = struct { before_units: u32, changed: bool };
    fn prepareTarget(self: *Context, section_index: usize, paragraph_index: usize, claimed_units: ?u32, edits: []const Edit) !TargetResult {
        const draft = try self.getSection(section_index);
        const s = self.session;
        const a = s.allocator;
        const selected = &s.sections[section_index];
        if (paragraph_index < selected.first_paragraph or paragraph_index > selected.last_paragraph) return error.InvalidParagraphIndex;
        const index = paragraph_index - selected.first_paragraph;
        if (index >= draft.values.paragraphs.len) return error.InvalidParagraphIndex;
        const paragraph = &draft.values.paragraphs[index];
        _ = try @import("current_paragraph_reference.zig").from(paragraph);
        try self.authorize(draft, paragraph);
        const tree = &selected.tree;
        const positions = try currentPositions(a, tree, paragraph);
        defer a.free(positions);
        const units = std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
        if (claimed_units) |claimed| if (claimed != units) return error.TextTransactionBeforeMismatch;
        if (@import("builtin").is_test) {
            self.work.paragraphs += 1;
            self.work.edits += edits.len;
        }
        var before_bytes: usize = 0;
        for (paragraph.sites.items) |site| before_bytes += site.text.len;
        var text = try @import("text_splice_transaction.zig").prepareManyProjected(a, &paragraph.sites, positions, edits, .{ .max_bytes = s.options.max_text_bytes, .replacement_inheritance = .first_replaced });
        defer text.deinit();
        if (!text.changed) return .{ .before_units = units, .changed = false };
        const owned = if (paragraph.character_styles == null) try originalStyles(a, tree, &paragraph.sites, positions, s.options.max_sites) else null;
        defer if (owned) |rows| a.free(rows);
        if (self.resource_ids == null) {
            const ids = try @import("character_style_resources.zig").ids(s);
            errdefer a.free(ids);
            var set: std.AutoHashMapUnmanaged(u32, void) = .empty;
            errdefer set.deinit(a);
            for (ids) |id| try set.put(a, id, {});
            self.resource_ids = ids;
            self.resource_set = set;
        }
        const current_styles = paragraph.character_styles orelse owned.?;
        for (current_styles) |span| {
            const id = span.char_shape_id orelse return error.MissingCharacterShapeReference;
            if (!self.resource_set.contains(id)) return error.InvalidCharacterShapeReference;
        }
        var metadata = try @import("character_style_splice.zig").prepareManyProjected(a, paragraph, &text, current_styles, s.options.max_sites);
        defer metadata.deinit();
        const protected = if (paragraph.protected_positions) |rows| try moveProtected(a, rows, text.edits) else null;
        var installed = false;
        defer if (!installed) if (protected) |rows| a.free(rows);
        _ = try metadata.commit(paragraph, &text);
        if (protected) |rows| {
            a.free(paragraph.protected_positions.?);
            paragraph.protected_positions = rows;
        }
        installed = true;
        var after_bytes: usize = 0;
        for (paragraph.sites.items) |site| after_bytes += site.text.len;
        self.total_bytes = std.math.add(usize, self.total_bytes - before_bytes, after_bytes) catch return error.LimitExceeded;
        draft.changed = true;
        return .{ .before_units = units, .changed = true };
    }
    /// Request preflight seal; never finishes or transfers private candidates.
    pub fn validatePrepared(self: *const Context) !void {
        try self.check();
        const s = self.session;
        if (self.total_bytes > s.options.max_text_bytes) return error.LimitExceeded;
        for (s.sections, self.global_digests) |live, seal| {
            try validateOwnership(&live);
            if (digest(&live) != seal) return error.StaleIndependentTextContext;
        }
    }
    pub fn finish(self: *Context) !bool {
        try self.validatePrepared();
        const s = self.session;
        const a = s.allocator;
        if (s.history_delta_managed and !s.history_transaction_active) return error.IndependentTextRequiresHistory;
        var changed = false;
        var iterator = self.drafts.iterator();
        while (iterator.next()) |entry| {
            const live = &s.sections[entry.key_ptr.*];
            const draft = entry.value_ptr;
            if (live.sites.items.ptr != draft.original_sites or (if (live.structure_values) |v| v.paragraphs.ptr else null) != draft.original_values or digest(live) != draft.digest) return error.StaleIndependentTextContext;
            try live.validateSourceBasis();
            if (draft.changed) {
                draft.empty = try a.alloc(@import("text_sites.zig").Site, 0);
                changed = true;
            }
        }
        iterator = self.drafts.iterator();
        while (iterator.next()) |entry| if (entry.value_ptr.changed) {
            const live = &s.sections[entry.key_ptr.*];
            const draft = entry.value_ptr;
            if (live.structure_values) |*old| old.deinit(a);
            live.sites.deinit(a);
            live.sites = .{ .items = draft.empty.? };
            draft.empty = null;
            live.structure_values = draft.values;
            draft.values = .{ .paragraphs = &.{} };
        };
        self.consumed = true;
        return changed;
    }
};
fn authorizePart(draft: *const SectionDraft, paragraph: *const model.Paragraph) !void {
    if (paragraph.template_element >= draft.flags.len) return error.SourceBindingMismatch;
    const f = draft.flags[paragraph.template_element];
    if (f.field) return error.UnsupportedIndependentFieldMetadata;
    if (f.title) return error.UnsupportedIndependentTitleMetadata;
    if (f.page) return error.UnsupportedIndependentPageMetadata;
    if (f.tracked) return error.UnsupportedParagraphTracking;
    if (f.column_at) |at| {
        var first: usize = std.math.maxInt(usize);
        for (paragraph.sites.items) |site| first = @min(first, site.start);
        if (at >= first) return error.UnsupportedIndependentColumnMetadata;
    }
}
fn validateOwnership(section: *const editor.Section) !void {
    if (section.structure_values) |values| {
        if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        for (values.paragraphs) |paragraph| for (paragraph.sites.items, 0..) |_, index| try paragraph.sites.validateTextOwnership(index);
    } else {
        for (section.sites.items, 0..) |_, index| try section.sites.validateTextOwnership(index);
    }
}

fn digestSite(hash: *std.hash.Wyhash, site: @import("text_sites.zig").Site) void {
    std.hash.autoHash(hash, @intFromPtr(site.text.ptr));
    std.hash.autoHash(hash, site.text.len);
    hash.update(site.text);
    std.hash.autoHash(hash, site.element_index);
    std.hash.autoHash(hash, site.start);
    std.hash.autoHash(hash, site.end);
    std.hash.autoHash(hash, site.missing_text);
    std.hash.autoHash(hash, site.empty_element);
    std.hash.autoHash(hash, site.anchor_boundary);
}
fn digest(section: *const editor.Section) u64 {
    var hash = std.hash.Wyhash.init(0);
    std.hash.autoHash(&hash, section.first_paragraph);
    std.hash.autoHash(&hash, section.last_paragraph);
    std.hash.autoHash(&hash, section.source_first_paragraph);
    std.hash.autoHash(&hash, @intFromPtr(section.tree.source.ptr));
    std.hash.autoHash(&hash, section.tree.source.len);
    std.hash.autoHash(&hash, @intFromPtr(section.tree.elements.ptr));
    std.hash.autoHash(&hash, section.tree.elements.len);
    if (section.structure_values) |values| {
        for (values.paragraphs) |paragraph| {
            std.hash.autoHash(&hash, paragraph.template_element);
            std.hash.autoHash(&hash, paragraph.generated_id);
            std.hash.autoHash(&hash, paragraph.source_ordinal);
            for (paragraph.sites.items) |site| digestSite(&hash, site);
            if (paragraph.character_styles) |rows| {
                for (rows) |row| std.hash.autoHash(&hash, row);
            }
        }
    } else {
        for (section.sites.items) |site| digestSite(&hash, site);
    }
    return hash.final();
}

fn originalStyles(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, positions: []const Segment, limit: usize) ![]Span {
    const typed = try @import("character_style_anchor_projection.zig").build(a, tree, sites, positions, limit);
    defer a.free(typed);
    return @import("character_style_anchor_adapter.zig").fromTyped(a, tree, sites, typed);
}
fn moveProtected(a: std.mem.Allocator, rows: []const model.ProtectedPosition, edits: []const @import("text_splice_many.zig").EffectiveEdit) ![]model.ProtectedPosition {
    const result = try a.dupe(model.ProtectedPosition, rows);
    errdefer a.free(result);
    var cursor: usize = 0;
    var removed: usize = 0;
    var added: usize = 0;
    var prior: usize = 0;
    for (result, 0..) |*row, i| {
        if (i != 0 and row.unit < prior) return error.SourceBindingMismatch;
        prior = row.unit;
        while (cursor < edits.len and edits[cursor].end <= row.unit) : (cursor += 1) {
            const edit = edits[cursor];
            if (edit.changed) {
                removed += edit.end - edit.start;
                added = std.math.add(usize, added, edit.inserted_units) catch return error.LimitExceeded;
            }
        }
        if (cursor < edits.len and edits[cursor].changed and edits[cursor].start < row.unit and edits[cursor].end > row.unit) return error.ProtectedInlineControl;
        row.unit = std.math.add(usize, row.unit - removed, added) catch return error.LimitExceeded;
    }
    return result;
}
pub fn applyBatch(session: *editor.Session, commands: []const Command) !bool {
    var context = try Context.init(session);
    defer context.deinit();
    for (commands) |command| {
        if (command.kind != .independent_text or command.start != 0 or command.deleted != 0 or command.inserted.len != 0 or command.break_before != null) return error.InvalidIndependentTextCommand;
        _ = try context.apply(command.section, command.paragraph, command.independent_text_edits);
    }
    return context.finish();
}

/// Scope-local adapter over existing Sites/Segment and source permission rules.
/// No new XML writer/model. Only selected paragraph nodes/sites are traversed.
fn localPositions(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const model.Paragraph) ![]Segment {
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    try @import("plain_paragraph_policy.zig").validateWithAnchors(tree, &paragraph.sites, locations, 1);
    var text_owners: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer text_owners.deinit(a);
    var output: std.ArrayList(Segment) = .empty;
    defer output.deinit(a);
    for (paragraph.sites.items, 0..) |site, i| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const element = tree.elements[site.element_index];
        if (!element.is(xml.paragraph_uri, if (site.missing_text) "run" else "t")) return error.SourceBindingMismatch;
        const run = if (site.missing_text) site.element_index else element.parent orelse return error.SourceBindingMismatch;
        if (run >= tree.elements.len or !tree.elements[run].is(xml.paragraph_uri, "run") or tree.elements[run].parent != paragraph.template_element) return error.SourceBindingMismatch;
        try output.append(a, .{ .kind = .text, .index = i, .source_start = site.start });
        try text_owners.put(a, site.element_index, {});
    }
    var owned = try @import("paragraph_owned_elements.zig").Iterator.init(tree, paragraph.template_element);
    while (try owned.next()) |index| {
        const node = tree.elements[index];
        if (node.parent) |parent| {
            if (text_owners.contains(parent)) if (@import("retained_inline_unit.zig").kind(tree, index)) |kind| {
                try output.append(a, .{ .kind = switch (kind) {
                    .tab => .tab,
                    .nb_space => .nb_space,
                    .fw_space => .fw_space,
                    .line_break => .line_break,
                    .hypen => .hypen,
                }, .index = index, .source_start = node.start_tag.start });
            };
            if (tree.elements[parent].is(xml.paragraph_uri, "run") and tree.elements[parent].parent == paragraph.template_element and @import("run_anchor.zig").kind(tree, index) != null) {
                try output.append(a, .{ .kind = .anchor, .index = index, .source_start = node.start_tag.start });
            }
        }
    }
    std.mem.sort(Segment, output.items, {}, struct {
        fn less(_: void, left: Segment, right: Segment) bool {
            if (left.source_start == right.source_start) return left.kind == .text and right.kind != .text;
            return left.source_start < right.source_start;
        }
    }.less);
    var units: usize = 0;
    for (output.items) |*position| {
        position.start_unit = units;
        units = std.math.add(usize, units, if (position.kind == .text) try @import("text_site_edit.zig").utf16Length(paragraph.sites.items[position.index].text) else 1) catch return error.LimitExceeded;
        position.end_unit = units;
    }
    return output.toOwnedSlice(a);
}
fn currentPositions(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const model.Paragraph) ![]Segment {
    // Existing owned joined-protected adapter retains its exact topology rules;
    // its pre-existing per-piece projection cost is a separate bounded limit.
    if (paragraph.pieces != null and paragraph.protected_positions != null) return @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    var original: []Segment = undefined;
    if (paragraph.joined()) |joined| {
        var output: std.ArrayList(Segment) = .empty;
        defer output.deinit(a);
        var base: usize = 0;
        for (joined.pieces, 0..) |piece, i| {
            const part = try joined.paragraph(i);
            const local = try localPositions(a, tree, &part);
            defer a.free(local);
            for (local) |position| {
                var row = position;
                if (row.kind == .text) row.index += piece.first_site;
                row.start_unit += base;
                row.end_unit += base;
                try output.append(a, row);
            }
            if (local.len != 0) base += local[local.len - 1].end_unit;
        }
        original = try output.toOwnedSlice(a);
    } else original = try localPositions(a, tree, paragraph);
    if (paragraph.protected_positions) |positions| {
        defer a.free(original);
        var owners: std.AutoHashMapUnmanaged(usize, model.ProtectedPosition) = .empty;
        defer owners.deinit(a);
        for (positions) |position| {
            const entry = try owners.getOrPut(a, position.element_index);
            if (entry.found_existing) return error.SourceBindingMismatch;
            entry.value_ptr.* = position;
        }
        var result: std.ArrayList(Segment) = .empty;
        defer result.deinit(a);
        var cursor: usize = 0;
        var matched: usize = 0;
        for (original) |position| {
            if (position.kind != .text) {
                const p = owners.get(position.index) orelse continue;
                if (p.unit != cursor or (p.kind == .anchor) != (position.kind == .anchor)) return error.SourceBindingMismatch;
                matched += 1;
            }
            var row = position;
            row.start_unit = cursor;
            cursor += position.end_unit - position.start_unit;
            row.end_unit = cursor;
            try result.append(a, row);
        }
        if (matched != positions.len) return error.SourceBindingMismatch;
        return result.toOwnedSlice(a);
    }
    return original;
}
