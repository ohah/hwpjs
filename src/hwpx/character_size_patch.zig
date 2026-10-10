//! Height patch preserves unrelated XML and schema-default absence.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, size: i32, limit: usize) ![]u8 {
    try @import("../model/character_properties.zig").validate(.{ .size = size });
    const shape = try @import("character_shape_display.zig").read(a, tree, node, 4096);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    if ((shape.height orelse 1000) == size) return a.dupe(u8, fragment);
    const attribute = try tree.attributeValue(a, node, "", "height");
    const replacement = if (attribute) |value| try std.fmt.allocPrint(a, "{c}{d}{c}", .{ value.raw[0], size, value.raw[0] }) else try std.fmt.allocPrint(a, " height=\"{d}\"", .{size});
    defer a.free(replacement);
    const start = if (attribute) |value| @intFromPtr(value.raw.ptr) - @intFromPtr(fragment.ptr) else tree.elements[node].start_tag.end - tree.elements[node].start_tag.start - (if (tree.elements[node].end_tag == null) @as(usize, 2) else @as(usize, 1));
    return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = start, .end = start + if (attribute) |value| value.raw.len else @as(usize, 0), .text = "", .serialized_xml = replacement }}, limit);
}

test "HWPX character size patch preserves quotes defaults and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='9' height = '1000' opaque='keep'><h:bold/><!--keep--></h:charPr><h:charPr id='10'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, 2400, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:charPr id='9' height = '2400' opaque='keep'><h:bold/><!--keep--></h:charPr>", output);
            const defaulted = try write(allocator, source, 3, 1000, 4096);
            defer allocator.free(defaulted);
            try std.testing.expectEqualStrings("<h:charPr id='10'/>", defaulted);
            const inserted = try write(allocator, source, 3, 0, 4096);
            defer allocator.free(inserted);
            try std.testing.expectEqualStrings("<h:charPr id='10' height=\"0\"/>", inserted);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.expectError(error.InvalidCharacterSize, write(a, &tree, 1, -1, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 2400, 1));
}
