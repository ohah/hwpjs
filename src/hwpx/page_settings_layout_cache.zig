//! Page geometry invalidates line-layout caches in the selected section only.
//! Unknown cache content is rejected, never erased as if it were known derived data.
const std = @import("std");
const hp = @import("document_xml.zig").paragraph_uri;
const attrs = @import("xml_part_attributes.zig");
const writer = @import("xml_source_writer.zig");
fn checkAttributes(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, node: usize, names: []const []const u8) !void {
    var tag = try attrs.parseStartTag(a, tree, node);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try @import("../xml/namespaces.zig").isDeclaration(attribute.name)) continue;
        const qname = try @import("../xml/qname.zig").parse(attribute.name);
        if (qname.prefix != null) return error.UnsupportedPageLayoutCache;
        var known = false;
        for (names) |name| if (qname.local.equals(name, false)) {
            known = true;
            break;
        };
        if (!known) return error.UnsupportedPageLayoutCache;
    }
}
fn whitespace(bytes: []const u8) !void {
    if (std.mem.trim(u8, bytes, " \t\r\n").len != 0) return error.UnsupportedPageLayoutCache;
}
pub fn remove(a: std.mem.Allocator, source: []const u8, section: usize, item: usize, limit: usize) ![]u8 {
    var tree = try @import("section_tree.zig").parse(a, source, section, item, .{});
    defer tree.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    for (tree.elements, 0..) |cache, index| {
        if (!cache.is(hp, "linesegarray")) continue;
        const parent = cache.parent orelse return error.UnsupportedPageLayoutCache;
        if (!tree.elements[parent].is(hp, "p")) return error.UnsupportedPageLayoutCache;
        try checkAttributes(a, &tree, index, &.{});
        var child = cache.first_child;
        var cursor = cache.start_tag.end;
        while (child) |node| : (child = tree.elements[node].next_sibling) {
            const e = tree.elements[node];
            if (!e.is(hp, "lineseg") or e.first_child != null) return error.UnsupportedPageLayoutCache;
            try whitespace(source[cursor..e.start_tag.start]);
            try checkAttributes(a, &tree, node, &.{ "textpos", "vertpos", "vertsize", "textheight", "baseline", "spacing", "horzpos", "horzsize", "flags" });
            if (e.end_tag) |ending| try whitespace(source[e.start_tag.end..ending.start]);
            cursor = e.end;
        }
        if (cache.end_tag) |ending| try whitespace(source[cursor..ending.start]);
        // Preorder source ranges are already disjoint and sorted. One linear pass.
        try changes.append(a, .{ .start = cache.start_tag.start, .end = cache.end, .text = "", .serialized_xml = "" });
    }
    return writer.write(a, source, changes.items, limit);
}
