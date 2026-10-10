//! Source-preserving group append; caller validates hierarchy and child semantics.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");
pub const Count = enum { font, item };

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, count_kind: Count, actual_count: u32, payload: []const u8, limit: usize) ![]u8 {
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const count_name = if (count_kind == .font) "fontCnt" else "itemCnt";
    const next = std.math.add(u32, actual_count, 1) catch return error.LimitExceeded;
    const count_raw = try tree.attributeValue(a, node, "", count_name);
    if (count_raw) |raw| {
        const text = try raw.toUtf8(a, 64);
        defer a.free(text);
        if (try @import("xml_values.zig").unsigned32(text) != actual_count) return error.ResourceCountMismatch;
    }
    const element = tree.elements[node];
    const opening = tree.source[element.start_tag.start..element.start_tag.end];
    const count = if (count_raw) |raw| try std.fmt.allocPrint(a, "{c}{d}{c}", .{ raw.raw[0], next, raw.raw[0] }) else try std.fmt.allocPrint(a, " {s}=\"{d}\"", .{ count_name, next });
    defer a.free(count);
    const at = if (count_raw) |raw| @intFromPtr(raw.raw.ptr) - @intFromPtr(opening.ptr) else opening.len - (if (element.end_tag == null) @as(usize, 2) else @as(usize, 1));
    const start = try writer.write(a, opening, &.{.{ .start = at, .end = at + if (count_raw) |raw| raw.raw.len else @as(usize, 0), .text = "", .serialized_xml = count }}, limit);
    defer a.free(start);
    var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, node);
    defer tag.deinit(a);
    const replacement = if (element.end_tag) |end|
        try std.fmt.allocPrint(a, "{s}{s}{s}{s}", .{ start, tree.source[element.start_tag.end..end.start], payload, tree.source[end.start..element.end] })
    else
        try std.fmt.allocPrint(a, "{s}>{s}</{s}>", .{ start[0 .. start.len - 2], payload, tag.name.raw });
    defer a.free(replacement);
    return writer.write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = replacement }}, limit);
}

test "XML group append increments item count preserves QName and rejects overflow" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:fontfaces itemCnt='0'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, .item, 0, "<!--keep-->", 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:fontfaces itemCnt='1'><!--keep--></h:fontfaces></h:head>", output);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .item, std.math.maxInt(u32), "", 4096));
    try std.testing.expectError(error.ResourceCountMismatch, write(a, &tree, 1, .item, 1, "", 4096));
    try std.testing.expectEqualStrings(input, tree.source);
}
