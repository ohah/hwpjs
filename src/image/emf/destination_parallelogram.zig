const std = @import("std");
const geometry = @import("geometry.zig");

pub const PointI64 = struct { x: i64, y: i64 };
pub const Parallelogram = struct {
    upper_left: geometry.PointL,
    upper_right: geometry.PointL,
    lower_left: geometry.PointL,

    pub fn lowerRight(self: Parallelogram) PointI64 {
        return .{
            .x = @as(i64, self.upper_right.x) + self.lower_left.x - self.upper_left.x,
            .y = @as(i64, self.upper_right.y) + self.lower_left.y - self.upper_left.y,
        };
    }
};

pub fn parse(bytes: []const u8) !Parallelogram {
    if (bytes.len != 24) return error.InvalidEmfDestinationParallelogramSize;
    return .{
        .upper_left = try geometry.parsePointL(bytes[0..8]),
        .upper_right = try geometry.parsePointL(bytes[8..16]),
        .lower_left = try geometry.parsePointL(bytes[16..24]),
    };
}

test "destination parallelogram preserves three wire points and computes exact wide fourth" {
    var bytes = [_]u8{0} ** 24;
    for ([_]i32{ std.math.maxInt(i32), std.math.minInt(i32), std.math.maxInt(i32), std.math.maxInt(i32), std.math.minInt(i32), std.math.maxInt(i32) }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[index * 4 ..][0..4], value, .little);
    const value = try parse(&bytes);
    try std.testing.expectEqual(std.math.maxInt(i32), value.upper_left.x);
    try std.testing.expectEqual(std.math.minInt(i32), value.lower_left.x);
    try std.testing.expectEqual(@as(i64, -2147483648), value.lowerRight().x);
    try std.testing.expectEqual(@as(i64, 6442450942), value.lowerRight().y);
    try std.testing.expectError(error.InvalidEmfDestinationParallelogramSize, parse(bytes[0..23]));
}
