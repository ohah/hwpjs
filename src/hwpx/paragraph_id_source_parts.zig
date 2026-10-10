//! Transient immutable non-section parts for generated paragraph ID inventory.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");

pub fn read(a: std.mem.Allocator, source: []const u8, limit: usize) ![]tree_module.Tree {
    var document = try @import("package.zig").inspectDocument(a, source, .{});
    defer document.deinit(a);
    var trees: std.ArrayList(tree_module.Tree) = .empty;
    defer {
        for (trees.items) |*tree| tree.deinit(a);
        trees.deinit(a);
    }
    var header = try document.readHeaderTree(a, .{ .tree = .{ .max_xml_bytes = limit } });
    var moved = false;
    defer if (!moved) header.deinit(a);
    try trees.append(a, header);
    moved = true;
    var remaining = limit - header.source.len;
    for (document.manifest.items, 0..) |item, index| {
        if (!@import("masterpage_parts.zig").isPartHref(item.href)) continue;
        if (!std.mem.eql(u8, item.media_type, @import("content_manifest.zig").xml_media_type)) return error.InvalidMasterPageMediaType;
        const entry = item.entry_index orelse return error.UnsupportedExternalMasterPage;
        if (entry >= document.archive.entries.len) return error.InvalidManifestEntryIndex;
        const bytes = try document.archive.decode(document.archive.entries[entry], remaining);
        defer a.free(bytes);
        var tree = try tree_module.parse(a, bytes, .master_page, trees.items.len - 1, index, .{ .max_xml_bytes = remaining });
        var transferred = false;
        defer if (!transferred) tree.deinit(a);
        try trees.append(a, tree);
        transferred = true;
        remaining -= bytes.len;
    }
    return trees.toOwnedSlice(a);
}
