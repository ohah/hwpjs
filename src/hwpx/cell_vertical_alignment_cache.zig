//! Only known caches inside the selected original cell text list are invalidated.
const std = @import("std");
const hp = @import("document_xml.zig").paragraph_uri;
const writer = @import("xml_source_writer.zig");
pub fn remove(a: std.mem.Allocator, bytes: []const u8, section: usize, item: usize, list: usize, limit: usize) ![]u8 {
    var tree = try @import("section_tree.zig").parse(a, bytes, section, item, .{});
    defer tree.deinit(a);
    if (list >= tree.elements.len or !tree.elements[list].is(hp, "subList")) return error.InvalidCellDisplayOwner;
    const cell = tree.elements[list].parent orelse return error.InvalidCellDisplayOwner;
    if (!tree.elements[cell].is(hp, "tc")) return error.InvalidCellDisplayOwner;
    try @import("page_settings_layout_cache.zig").validateSubtree(a, &tree, .{ .root_node = list });
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    const root = tree.elements[list];
    for (tree.elements[list..]) |node| {
        if (node.start_tag.start >= root.end) break;
        if (!node.is(hp, "linesegarray")) continue;
        try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = "" });
    }
    return writer.write(a, bytes, changes.items, limit);
}
