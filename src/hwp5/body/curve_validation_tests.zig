const std = @import("std");
const t = std.testing;
const validation = @import("curve_validation.zig");
fn check(a: std.mem.Allocator, layout: @import("shape_curve.zig").Layout, scenario: u8) !void {
    var b = [_]u8{0} ** 66;
    const width: usize = if (layout == .specified_i16_axes) 2 else 4;
    const size = width + 16 + 1 + 4;
    std.mem.writeInt(u32, b[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, b[4..8], 0x24637572, .little);
    std.mem.writeInt(u32, b[8..12], 83 | (1 << 10) | (@as(u32, @intCast(size)) << 20), .little);
    b[12] = 2;
    b[12 + width + 16] = 255;
    const end = 12 + size;
    @memcpy(b[end..][0 .. size + 4], b[8..end]);
    var bytes: []const u8 = b[0..end];
    if (scenario == 1) bytes = b[0..8];
    if (scenario == 2) bytes = b[0 .. end + size + 4];
    if (scenario == 3) {
        std.mem.writeInt(u32, b[8..12], 83 | (@as(u32, @intCast(size)) << 20), .little);
        bytes = b[8..end];
    }
    if (scenario == 4) @memset(b[12..][0..width], 255);
    if (scenario == 5) {
        std.mem.writeInt(u32, b[8..12], 83 | (1 << 10) | (@as(u32, @intCast(width + 16)) << 20), .little);
        bytes = b[0 .. 12 + width + 16];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = validation.inspect(tree, layout);
    switch (scenario) {
        0 => try t.expectEqualDeep(validation.Report{ .curves = 1, .points = 2, .segments = 1, .unknown_segments = 1, .extra_bytes = 4 }, try result),
        1 => try t.expectError(error.MissingCurve, result),
        2 => try t.expectError(error.DuplicateCurve, result),
        3 => try t.expectError(error.OrphanCurve, result),
        4 => try t.expectError(error.NegativePointCount, result),
        5 => try t.expectError(error.UnexpectedEnd, result),
        else => unreachable,
    }
}
test "curve owner cleanup handles both layouts and truncated segment arrays" {
    for ([_]@import("shape_curve.zig").Layout{ .specified_i16_axes, .observed_i32_points }) |layout| {
        for (0..6) |scenario| try t.checkAllAllocationFailures(t.allocator, check, .{ layout, @as(u8, @intCast(scenario)) });
    }
}
