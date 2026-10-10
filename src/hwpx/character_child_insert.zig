//! Insert a serialized head child without rewriting other character XML.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, serialized: []const u8, following: []const []const u8, limit: usize) ![]u8 {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const element = tree.elements[node];
    if (!element.is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    if (element.end_tag == null) {
        var input = try @import("../xml/input.zig").Input.init(fragment, .utf8, .{ .max_bytes = fragment.len, .max_characters = fragment.len });
        var tag = try @import("../xml/tags.zig").parse(a, &input, .{ .max_bytes = fragment.len });
        defer tag.deinit(a);
        const expanded = try std.fmt.allocPrint(a, "{s}>{s}</{s}>", .{ fragment[0 .. fragment.len - 2], serialized, tag.name.raw });
        defer a.free(expanded);
        return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = 0, .end = fragment.len, .text = "", .serialized_xml = expanded }}, limit);
    }
    const base = element.start_tag.start;
    var insertion = element.end_tag.?.start - base;
    var child = element.first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        for (following) |name| if (tree.elements[index].is(uri, name)) {
            insertion = @min(insertion, tree.elements[index].start_tag.start - base);
        };
    }
    return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = insertion, .end = insertion, .text = "", .serialized_xml = serialized }}, limit);
}
