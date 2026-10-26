//! Prove original/current topology and owner identity, never text or permission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Range = @import("field_text_ranges.zig").Range;
const fields = @import("field_markers.zig");
pub fn validate(session: anytype, section: usize, paragraph: usize, report: *const fields.Report, ranges: []const Range, frames: []const @import("xml_tree_selection.zig").Frame) !usize {
    const a = session.allocator;
    const part = &session.sections[section];
    const current = if (part.structure_values) |*v| v else return error.UnsupportedStructuralFieldEdit;
    var bound = try @import("source_field_analysis.zig").lease(session);
    defer bound.deinit(a);
    // Cache is provenance only: fresh strict source analysis detects stale or
    // forged marker/range metadata. Current strings never come from either.
    var fresh = try @import("source_field_analysis.zig").build(a, session.sections);
    defer fresh.deinit(a);
    if (fresh.report.markers.len != report.markers.len or fresh.fields.len != ranges.len) return error.SourceBindingMismatch;
    for (fresh.report.markers, report.markers) |left, right| {
        if (!sameMetadata(fields.Marker, left, right)) return error.SourceBindingMismatch;
    }
    for (fresh.fields, ranges) |left, right| if (!std.meta.eql(left, right)) return error.SourceBindingMismatch;
    if (part.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    const Row = @import("paragraph_structure_values.zig").Paragraph;
    const Context = struct {
        tree: *const Tree,
        rows: []const Row,
        index: usize = 0,
        fn visit(raw: *anyopaque, event: @import("section_text.zig").Event) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            const item = switch (event) {
                .paragraph_start => |v| v,
                else => return,
            };
            if (self.index >= self.rows.len) return error.SourceBindingMismatch;
            const row = &self.rows[self.index];
            self.index += 1;
            if (row.template_element != try self.tree.startTagIndex(item.tag.raw) or row.source_ordinal != item.location.paragraph_ordinal) return error.SourceBindingMismatch;
            if (row.generated_id != null or row.pieces != null or row.field_positions != null or row.protected_positions != null or row.title_positions != null or row.page_area_positions != null) return error.UnsupportedStructuralFieldEdit;
        }
    };
    var ctx = Context{ .tree = &part.tree, .rows = current.paragraphs };
    var counter = @import("section_text.zig").Report{ .paragraphs = (part.source_first_paragraph orelse part.first_paragraph) - 1 };
    const options = @import("editor_session.zig").siteOptions(session.options);
    try @import("section_text.zig").scanSource(a, part.tree.source, section, part.tree.item_index, .{ .branch_policy = options.branch_policy, .max_attribute_bytes = options.max_attribute_bytes, .max_text_bytes = options.max_text_bytes }, &counter, .{ .context = &ctx, .on_event = Context.visit });
    if (ctx.index != current.paragraphs.len) return error.SourceBindingMismatch;
    // Rebuild only original binding metadata. Original strings are discarded;
    // current strings remain authoritative. Counted keys reject forged spans,
    // flags, missing/duplicate sites and foreign paragraph ownership.
    var source_sites = try @import("text_sites.zig").collect(a, &part.tree, options);
    defer source_sites.deinit(a);
    const Key = struct { element: usize, start: usize, end: usize, empty: bool, missing: bool, anchor: bool };
    const Value = struct { owner: usize, remaining: usize };
    var bindings: std.AutoHashMapUnmanaged(Key, Value) = .empty;
    defer bindings.deinit(a);
    for (source_sites.items) |site| {
        const key = Key{ .element = site.element_index, .start = site.start, .end = site.end, .empty = site.empty_element, .missing = site.missing_text, .anchor = site.anchor_boundary };
        const owner = try @import("paragraph_site_owner.zig").ancestor(&part.tree, site.element_index);
        const entry = try bindings.getOrPut(a, key);
        if (!entry.found_existing) entry.value_ptr.* = .{ .owner = owner, .remaining = 0 };
        if (entry.value_ptr.owner != owner) return error.SourceBindingMismatch;
        entry.value_ptr.remaining += 1;
    }
    for (current.paragraphs) |p| for (p.sites.items) |site| {
        const key = Key{ .element = site.element_index, .start = site.start, .end = site.end, .empty = site.empty_element, .missing = site.missing_text, .anchor = site.anchor_boundary };
        const binding = bindings.getPtr(key) orelse return error.SourceBindingMismatch;
        if (binding.owner != p.template_element or binding.remaining == 0) return error.SourceBindingMismatch;
        binding.remaining -= 1;
    };
    var entries = bindings.valueIterator();
    while (entries.next()) |binding| if (binding.remaining != 0) return error.SourceBindingMismatch;
    const index = paragraph - part.first_paragraph;
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const row = &current.paragraphs[index];
    for (ranges) |field| {
        if (field.section != section) continue;
        for ([_]usize{ report.markers[field.begin_marker].element_index, report.markers[field.end_marker].element_index }) |marker| {
            const owner = try @import("field_marker_ownership.zig").paragraph(&part.tree, frames, marker);
            var count: usize = 0;
            for (current.paragraphs) |p| if (p.template_element == owner) {
                count += 1;
            };
            if (count != 1) return error.SourceBindingMismatch;
        }
    }
    return row.template_element;
}
// Compare decoded metadata by value, not fresh allocator addresses. The cache
// cannot impersonate CLICK_HERE or override child/link diagnostics.
fn sameMetadata(comptime T: type, left: T, right: T) bool {
    return switch (@typeInfo(T)) {
        .@"struct" => |info| block: {
            inline for (info.field_names, info.field_types) |name, FieldType| {
                if (!sameMetadata(FieldType, @field(left, name), @field(right, name))) break :block false;
            }
            break :block true;
        },
        .optional => |info| if (left) |value| (if (right) |other| sameMetadata(info.child, value, other) else false) else right == null,
        .pointer => |info| if (info.size == .slice and info.child == u8) std.mem.eql(u8, left, right) else @compileError("Unsupported marker metadata pointer"),
        else => left == right,
    };
}
