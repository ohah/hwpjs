const std = @import("std");
const Corners = @import("../hwpx/picture_rendering_corners.zig").Corners;

pub fn encode(a: std.mem.Allocator, corners: Corners) ![]u8 {
    for (corners) |point| for (point) |number| {
        if (!std.math.isFinite(number)) return error.InvalidPictureRenderingCorners;
    };
    const bytes = try a.alloc(u8, 72);
    std.mem.writeInt(u32, bytes[0..4], 0x314b5048, .little);
    std.mem.writeInt(u32, bytes[4..8], 0, .little);
    for (corners, 0..) |point, index| for (point, 0..) |number, coordinate| {
        const offset = 8 + (index * 2 + coordinate) * 8;
        std.mem.writeInt(u64, bytes[offset..][0..8], @bitCast(number), .little);
    };
    return bytes;
}

test "HWPX picture corners wire validates finite values and releases allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try encode(allocator, .{ .{ -1, 0 }, .{ 2, 0 }, .{ 2, 3 }, .{ -1, 3 } });
            defer allocator.free(bytes);
            try std.testing.expectEqual(@as(u32, 0x314b5048), std.mem.readInt(u32, bytes[0..4], .little));
            try std.testing.expectEqual(@as(f64, -1), @as(f64, @bitCast(std.mem.readInt(u64, bytes[8..16], .little))));
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidPictureRenderingCorners, encode(a, .{ .{ std.math.nan(f64), 0 }, .{ 2, 0 }, .{ 2, 3 }, .{ 0, 3 } }));
}
