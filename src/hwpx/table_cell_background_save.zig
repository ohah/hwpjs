//! Compose COW header resources and source-bound cell references at save time.
const std = @import("std");
const editor = @import("editor_session.zig");
const cell = @import("table_cell_background_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");
fn identity(tree: *const Tree, index: usize) bool {
    // cellSz may already have been resized. Its child values are not owner identity.
    for ([_][]const u8{ "tbl", "tr", "tc", "cellAddr", "cellSpan", "subList" }) |name| if (fields.childIs(tree, index, name)) return true;
    return false;
}

pub fn section(a: std.mem.Allocator, source: *const Tree, xml: []const u8, values: []const cell.Entry, ids: []const u32, indices: []const usize, section_index: usize, limit: usize) ![]u8 {
    if (values.len != ids.len) return error.SourceBindingMismatch;
    if (xml.len > limit or values.len > 100000) return error.LimitExceeded;
    var current = try @import("section_tree.zig").parse(a, xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, identity);
    defer mapping.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| a.free(change.start_tag.?);
        changes.deinit(a);
    }
    var requested = std.AutoHashMap(usize, u32).init(a);
    defer requested.deinit();
    for (indices) |i| {
        if (i >= values.len) return error.SourceBindingMismatch;
        const entry = values[i];
        if (entry.section != section_index) return error.SourceBindingMismatch;
        const id = ids[i];
        const node = mapping.get(entry.cell_node) orelse return error.SourceBindingMismatch;
        const table = mapping.get(entry.table_node) orelse return error.SourceBindingMismatch;
        const list = mapping.get(entry.list_node) orelse return error.SourceBindingMismatch;
        if (!fields.childIs(&current, node, "tc") or !fields.childIs(&current, table, "tbl") or !fields.childIs(&current, list, "subList") or current.elements[list].parent != node) return error.SourceBindingMismatch;
        const row = current.elements[node].parent orelse return error.SourceBindingMismatch;
        if (!fields.childIs(&current, row, "tr") or current.elements[row].parent != table) return error.SourceBindingMismatch;
        const raw = (try current.attributeValue(a, node, "", "borderFillIDRef")) orelse return error.MissingBorderFillReference;
        if (try fields.unsigned(a, raw, 4096) != entry.source_id) return error.SourceBindingMismatch;
        const selected = try requested.getOrPut(node);
        if (selected.found_existing) return error.InvalidCellBackgroundOwner;
        selected.value_ptr.* = id;
    }
    // Tree order gives sorted, non-overlapping patches without an M log M sort.
    for (current.elements, 0..) |element, node| {
        const id = requested.get(node) orelse continue;
        const tag = try @import("xml_unsigned_attributes_write.zig").write(a, &current, node, &.{"borderFillIDRef"}, .{id}, limit);
        const span = element.start_tag;
        changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag }) catch |err| {
            a.free(tag);
            return err;
        };
    }
    return writer.write(a, current.source, changes.items, limit);
}

pub const CurrentHeader = struct {
    replacement: @import("../zip/replace_writer.zig").Replacement,
    ids: []u32,
    offsets: []usize,
    indices: []usize,
    stats: @import("border_fill_resource_patch.zig").SolidBatchStats,
    pub fn forSection(self: *const CurrentHeader, index: usize) []const usize {
        return self.indices[self.offsets[index]..self.offsets[index + 1]];
    }
};

/// One grouping pass, one current-binding scan per affected section, one header
/// parse and one header write. No per-intent full-header/section traversal.
pub fn currentHeader(session: *const editor.Session) !CurrentHeader {
    const a = session.allocator;
    const values = session.cell_backgrounds.items;
    if (values.len > 100000) return error.LimitExceeded;
    const offsets = try a.alloc(usize, session.sections.len + 1);
    errdefer a.free(offsets);
    @memset(offsets, 0);
    for (values) |entry| {
        if (entry.section >= session.sections.len) return error.InvalidSectionIndex;
        offsets[entry.section + 1] += 1;
    }
    for (1..offsets.len) |i| offsets[i] += offsets[i - 1];
    const positions = try a.dupe(usize, offsets);
    defer a.free(positions);
    const indices = try a.alloc(usize, values.len);
    errdefer a.free(indices);
    for (values, 0..) |entry, i| {
        indices[positions[entry.section]] = i;
        positions[entry.section] += 1;
    }
    for (session.sections, 0..) |*source, section_index| {
        const selected = indices[offsets[section_index]..offsets[section_index + 1]];
        if (selected.len == 0) continue;
        var wanted = std.AutoHashMap(usize, usize).init(a);
        defer wanted.deinit();
        var found = std.AutoHashMap(usize, void).init(a);
        defer found.deinit();
        for (selected) |i| {
            const entry = try wanted.getOrPut(values[i].list_node);
            if (entry.found_existing) return error.InvalidCellBackgroundOwner;
            entry.value_ptr.* = i;
        }
        const bindings = try @import("table_display_bindings.zig").read(a, session, section_index);
        defer a.free(bindings);
        for (bindings) |binding| {
            const i = wanted.get(binding.owner.list_node) orelse continue;
            const entry = values[i];
            if (binding.owner.table_node != entry.table_node or binding.owner.cell_node != entry.cell_node) return error.InvalidCellBackgroundOwner;
            if (found.contains(entry.list_node)) continue;
            const raw = (try source.tree.attributeValue(a, entry.cell_node, "", "borderFillIDRef")) orelse return error.MissingBorderFillReference;
            if (try fields.unsigned(a, raw, 4096) != entry.source_id) return error.SourceBindingMismatch;
            try found.put(entry.list_node, {});
        }
        if (found.count() != wanted.count()) return error.InvalidCellBackgroundOwner;
    }
    var base = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
    errdefer a.free(base.bytes);
    var tree = try @import("header_tree.zig").parse(a, base.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
    defer tree.deinit(a);
    const requests = try a.alloc(@import("border_fill_resource_patch.zig").SolidRequest, values.len);
    defer a.free(requests);
    for (values, requests) |entry, *request| request.* = .{ .source_id = entry.source_id, .color = entry.color };
    var stats: @import("border_fill_resource_patch.zig").SolidBatchStats = .{};
    const result = try @import("border_fill_resource_patch.zig").writeSolidBatch(a, &tree, requests, session.options.max_xml_bytes, try cell.profile(session), &stats);
    a.free(base.bytes);
    base.bytes = result.bytes;
    return .{ .replacement = base, .ids = result.ids, .offsets = offsets, .indices = indices, .stats = stats };
}

pub fn borderSources(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) !@import("table_border_sources.zig").Report {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const prepared = try currentHeader(session);
    defer session.allocator.free(prepared.replacement.bytes);
    defer session.allocator.free(prepared.ids);
    defer session.allocator.free(prepared.offsets);
    defer session.allocator.free(prepared.indices);
    var current_header = try @import("header_tree.zig").parse(a, prepared.replacement.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
    defer current_header.deinit(a);
    const source = &session.sections[section_index].tree;
    const changed = try section(a, source, source.source, session.cell_backgrounds.items, prepared.ids, prepared.forSection(section_index), section_index, session.options.max_xml_bytes);
    defer a.free(changed);
    var current_section = try @import("section_tree.zig").parse(a, changed, section_index, source.item_index, .{});
    defer current_section.deinit(a);
    var result = try @import("table_border_sources.zig").readTrees(a, &current_section, &current_header);
    errdefer result.deinit(a);
    try @import("source_color_projection.zig").enrichReport(&result, try cell.profile(session));
    return result;
}
