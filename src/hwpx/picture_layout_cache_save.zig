//! Drops derived paragraph line caches after composing picture geometry edits.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");
pub const Edits = struct {
    dimensions: []const @import("picture_dimension_edit_values.zig").Entry,
    matrices: []const @import("picture_matrix_edit_values.zig").Entry,
    frames: []const @import("picture_frame_values.zig").Entry,
};
pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, edits: Edits, limit: usize) ![]u8 {
    if (xml.len > limit or edits.dimensions.len > 100000 or edits.matrices.len > 100000 or edits.frames.len > 100000) return error.LimitExceeded;
    var current = try @import("section_tree.zig").parse(a, xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, @import("picture_source_identity.zig").isOwner);
    defer mapping.deinit(a);
    var pictures: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer pictures.deinit(a);
    for (edits.dimensions) |entry| try pictures.put(a, entry.picture_node, {});
    for (edits.frames) |entry| try pictures.put(a, entry.picture_node, {});
    for (edits.matrices) |entry| {
        if (entry.matrix_node >= source.elements.len) return error.SourceBindingMismatch;
        const rendering = source.elements[entry.matrix_node].parent orelse return error.SourceBindingMismatch;
        if (!fields.childIs(source, rendering, "renderingInfo")) return error.SourceBindingMismatch;
        const picture = source.elements[rendering].parent orelse return error.SourceBindingMismatch;
        try pictures.put(a, picture, {});
    }
    var paragraphs: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer paragraphs.deinit(a);
    var keys = pictures.keyIterator();
    while (keys.next()) |key| {
        const node = mapping.get(key.*) orelse return error.SourceBindingMismatch;
        if (!fields.childIs(&current, node, "pic")) return error.SourceBindingMismatch;
        var parent = current.elements[node].parent;
        while (parent) |owner| : (parent = current.elements[owner].parent) {
            if (fields.childIs(&current, owner, "p")) try paragraphs.put(a, owner, {});
        }
    }
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var owners = paragraphs.keyIterator();
    while (owners.next()) |owner| {
        var child = current.elements[owner.*].first_child;
        while (child) |node| : (child = current.elements[node].next_sibling) {
            if (!fields.childIs(&current, node, "linesegarray")) continue;
            try changes.append(a, .{ .start = current.elements[node].start_tag.start, .end = current.elements[node].end, .text = "", .serialized_xml = "" });
        }
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, xml, changes.items, limit);
}
