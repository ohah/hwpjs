const std = @import("std");
const t = std.testing;
const P = @import("ruby.zig").Properties;
test "ruby keeps two raw strings and five full-width values" {
    var raw = [_]u8{0} ** 31;
    std.mem.writeInt(u16, raw[0..2], 1, .little);
    @memcpy(raw[2..4], &[_]u8{ 0, 0xd8 });
    std.mem.writeInt(u16, raw[4..6], 2, .little);
    @memcpy(raw[6..10], &[_]u8{ 0, 0, 0xff, 0xfe });
    inline for (0..5) |i| std.mem.writeInt(u32, raw[10 + i * 4 ..][0..4], 0xfffffffb + i, .little);
    raw[30] = 9;
    const p = try P.parse(&raw);
    try t.expectEqualSlices(u8, raw[2..4], p.main_text);
    try t.expectEqualSlices(u8, raw[6..10], p.sub_text);
    inline for (.{ "position", "size_ratio", "option", "style_number", "alignment" }, 0..) |f, i| try t.expectEqual(0xfffffffb + i, @field(p, f));
    try t.expectEqualSlices(u8, &.{9}, p.extra);
    for (0..30) |n| try t.expectError(error.UnexpectedEnd, P.parse(raw[0..n]));
    try t.expectError(error.UnexpectedEnd, P.parse(&([_]u8{0} ** 18)));
}
fn allocationCase(a: std.mem.Allocator, bad: bool) !void {
    var raw = [_]u8{0} ** 32;
    std.mem.writeInt(u32, raw[0..4], 71 | ((if (bad) @as(u32, 27) else 28) << 20), .little);
    std.mem.writeInt(u32, raw[4..8], @import("control_rules.zig").id("tdut"), .little);
    var tree = try @import("tree.zig").Tree.parse(a, raw[0..if (bad) 31 else 32], .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("ruby_validation.zig").inspect(tree);
    if (bad) try t.expectError(error.UnexpectedEnd, result) else try t.expectEqual(1, (try result).controls);
}
test "ruby tree allocation cleanup on success and final scalar truncation" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{true});
}
