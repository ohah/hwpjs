const geometry = @import("geometry.zig");

pub const width: usize = 8;

pub const Points = struct {
    raw: []const u8,

    pub fn parse(bytes: []const u8) !Points {
        if (bytes.len % width != 0) return error.InvalidEmfPointLArraySize;
        return .{ .raw = bytes };
    }

    pub fn count(self: Points) usize {
        return self.raw.len / width;
    }

    pub fn get(self: Points, index: usize) !geometry.PointL {
        if (index >= self.count()) return error.EmfPointLIndexOutOfBounds;
        return geometry.parsePointL(self.raw[index * width ..][0..width]);
    }
};

test "PointL array borrows exact records and preserves signed coordinates" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(i32, bytes[0..4], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, bytes[4..8], std.math.maxInt(i32), .little);
    const points = try Points.parse(&bytes);
    try std.testing.expectEqual(@as(usize, 2), points.count());
    try std.testing.expectEqual(@as(i32, std.math.minInt(i32)), (try points.get(0)).x);
    try std.testing.expectEqual(@as(i32, std.math.maxInt(i32)), (try points.get(0)).y);
    try std.testing.expectError(error.EmfPointLIndexOutOfBounds, points.get(2));
    try std.testing.expectError(error.InvalidEmfPointLArraySize, Points.parse(bytes[0..15]));
}
