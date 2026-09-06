const std = @import("std");
const t = std.testing;
fn allocationCase(a: std.mem.Allocator, scenario: u8) !void {
    var raw = [_]u8{0} ** 82;
    std.mem.writeInt(u32, raw[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], 0x24726563, .little);
    std.mem.writeInt(u32, raw[8..12], 79 | (1 << 10) | (33 << 20), .little);
    raw[12] = 255;
    @memcpy(raw[45..82], raw[8..45]);
    var bytes: []const u8 = raw[0..45];
    if (scenario == 1) bytes = raw[0..8];
    if (scenario == 2) bytes = &raw;
    if (scenario == 3) {
        std.mem.writeInt(u32, raw[8..12], 79 | (33 << 20), .little);
        bytes = raw[8..45];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    for ([_]@import("shape_rectangle.zig").Layout{ .specified_axes, .observed_points }) |layout| {
        const result = @import("rectangle_validation.zig").inspect(tree, layout);
        switch (scenario) {
            0 => {
                const report = try result;
                try t.expectEqual(1, report.rectangles);
                try t.expectEqual(1, report.out_of_range_rounding);
            },
            1 => try t.expectError(error.MissingRectangle, result),
            2 => try t.expectError(error.DuplicateRectangle, result),
            3 => try t.expectError(error.OrphanRectangle, result),
            else => unreachable,
        }
    }
}
test "rectangle ownership handles both layouts and allocation failure cleanup" {
    for (0..4) |scenario| try t.checkAllAllocationFailures(t.allocator, allocationCase, .{@as(u8, @intCast(scenario))});
}
