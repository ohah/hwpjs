const std = @import("std");
const t = std.testing;
const hf = @import("header_footer.zig");
fn allocationCase(a: std.mem.Allocator, bytes: []const u8, bad: bool) !void {
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(a);
    var groups = try @import("list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    const report = @import("header_footer_validation.zig").inspect(tree, groups.items, .observed8) catch |err| {
        if (bad and err == error.UnexpectedEnd) return;
        return err;
    };
    if (bad) return error.ExpectedAreaFailure;
    try t.expectEqual(1, report.controls);
    try t.expectEqual(1, report.lists);
}
test "header footer tree and group allocation failures clean both success and truncated area" {
    var raw = [_]u8{0} ** 34;
    std.mem.writeInt(u32, raw[0..4], 71 | (8 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], @import("control_rules.zig").id("head"), .little);
    std.mem.writeInt(u32, raw[12..16], 72 | (1 << 10) | (18 << 20), .little);
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{ &raw, false });
    std.mem.writeInt(u32, raw[12..16], 72 | (1 << 10) | (17 << 20), .little);
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{ raw[0..33], true });
}
test "header footer properties do not interpret extension as text area" {
    const bytes = [_]u8{ 3, 0, 0, 0x80, 1, 2, 3, 4 };
    const p = try hf.Properties.parse(&bytes);
    try t.expectEqual(0x80000003, p.attributes);
    try t.expectEqual(3, p.pageKind());
    try t.expectEqualSlices(u8, bytes[4..], p.extra);
    for (0..4) |n| try t.expectError(error.UnexpectedEnd, hf.Properties.parse(bytes[0..n]));
}
test "header footer area retains unsigned dimensions all ref bits and odd tail" {
    const bytes = [_]u8{ 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0x80, 0x81, 0xfe, 7 };
    const area = try hf.Area.parse(&bytes);
    try t.expectEqual(0xffffffff, area.width);
    try t.expectEqual(0x80000000, area.height);
    try t.expectEqual(0x81, area.text_references);
    try t.expectEqual(0xfe, area.number_references);
    try t.expectEqualSlices(u8, &.{7}, area.extra);
    for (0..10) |n| try t.expectError(error.UnexpectedEnd, hf.Area.parse(bytes[0..n]));
}
