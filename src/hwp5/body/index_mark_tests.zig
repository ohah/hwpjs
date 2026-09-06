const std = @import("std");
const t = std.testing;
const P = @import("index_mark.zig").Properties;
fn allocationCase(a: std.mem.Allocator, bytes: []const u8, bad: bool) !void {
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(a);
    const report = @import("index_mark_validation.zig").inspect(tree) catch |err| {
        if (bad and err == error.UnexpectedEnd) return;
        return err;
    };
    if (bad) return error.ExpectedIndexMarkFailure;
    try t.expectEqual(1, report.controls);
}
test "index mark tree allocation failures clean success and short dummy" {
    var raw = [_]u8{0} ** 14;
    std.mem.writeInt(u32, raw[0..4], 71 | (10 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], @import("control_rules.zig").id("idxm"), .little);
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{ &raw, false });
    std.mem.writeInt(u32, raw[0..4], 71 | (9 << 20), .little);
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{ raw[0..13], true });
}
test "index mark keeps two distinct raw keywords, nonzero dummy and odd extra" {
    const b = [_]u8{ 1, 0, 0, 0xd8, 2, 0, 0, 0, 0xff, 0xfe, 0xff, 0xff, 7 };
    const p = try P.parse(&b);
    try t.expectEqualSlices(u8, b[2..4], p.first);
    try t.expectEqualSlices(u8, b[6..10], p.second);
    try t.expectEqual(65535, p.dummy);
    try t.expectEqualSlices(u8, &.{7}, p.extra);
    for (0..12) |n| try t.expectError(error.UnexpectedEnd, P.parse(b[0..n]));
}
test "index mark maximum counts cannot consume missing keyword bytes" {
    try t.expectError(error.UnexpectedEnd, P.parse(&.{ 0xff, 0xff, 0, 0, 0, 0 }));
    try t.expectError(error.UnexpectedEnd, P.parse(&.{ 0, 0, 0xff, 0xff, 0, 0 }));
    const p = try P.parse(&.{ 0, 0, 0, 0, 0, 0 });
    try t.expectEqual(0, p.first.len);
    try t.expectEqual(0, p.second.len);
}
