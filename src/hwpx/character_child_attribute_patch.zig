//! 검증된 직접 head 자식의 속성만 변경하며 나머지 XML 바이트는 보존합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, child_name: []const u8, name: []const u8, text: []const u8, limit: usize) ![]u8 {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const uri = @import("document_xml.zig").head_uri;
    if (!tree.elements[node].is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    const fragment = tree.sourceOf(node);
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (!element.is(uri, child_name)) continue;
        const attribute = try tree.attributeValue(a, index, "", name);
        const replacement = if (attribute) |raw| try std.fmt.allocPrint(a, "{c}{s}{c}", .{ raw.raw[0], text, raw.raw[0] }) else try std.fmt.allocPrint(a, " {s}=\"{s}\"", .{ name, text });
        defer a.free(replacement);
        const start = if (attribute) |raw| @intFromPtr(raw.raw.ptr) - @intFromPtr(fragment.ptr) else element.start_tag.end - tree.elements[node].start_tag.start - (if (element.end_tag == null) @as(usize, 2) else 1);
        return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = start, .end = start + if (attribute) |raw| raw.raw.len else @as(usize, 0), .text = "", .serialized_xml = replacement }}, limit);
    }
    return error.MissingCharacterChild;
}
