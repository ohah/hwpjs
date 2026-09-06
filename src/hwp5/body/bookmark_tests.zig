const std = @import("std");
const t = std.testing;
const parser = @import("../parameters/parser.zig");
const field = @import("../parameters/field_name.zig");
const options: parser.Options = .{ .header_layout = .observed6, .null_layout = .observed_empty };
fn allocationCase(a: std.mem.Allocator, bytes: []const u8, bad: bool) !void {
    var doc = parser.Document.parse(a, bytes, options) catch |err| {
        if (bad and err == error.UnexpectedEnd) return;
        return err;
    };
    defer doc.deinit(a);
    if (bad) return error.ExpectedBookmarkFailure;
    const result = try field.fromDocument(doc);
    try t.expectEqualSlices(u8, &.{ 0, 0, 0, 0xd8 }, result.field_name_utf16.?);
    try t.expectEqualSlices(u8, &.{9}, result.extra);
}
test "named field raw UTF16 and allocation failure cleanup" {
    const raw = [_]u8{ 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 2, 0, 0, 0, 0, 0xd8, 9 };
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{ &raw, false });
    for (0..16) |n| try t.checkAllAllocationFailures(t.allocator, allocationCase, .{ raw[0..n], true });
}
fn treeCase(a: std.mem.Allocator) !void {
    const raw = [_]u8{ 71, 0, 0x40, 0, 'm', 'k', 'o', 'b', 87, 4, 0xc0, 0, 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 0, 0 };
    var tree = try @import("tree.zig").Tree.parse(a, &raw, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = try @import("../parameters/sources.zig").inspectBodyDetailed(a, tree, .{ .parameters = options, .list_layout = .observed8, .bin_data_count = 0 });
    try t.expectEqual(1, result.bookmarks.names);
    try t.expectEqual(0, result.bookmarks.name_units);
    try t.expectEqual(1, result.parameters.parsed);
}
test "bookmark hierarchy and shared parse allocation cleanup" {
    try t.checkAllAllocationFailures(t.allocator, treeCase, .{});
}
