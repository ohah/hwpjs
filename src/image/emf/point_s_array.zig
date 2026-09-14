const geometry = @import("geometry.zig");

pub const width: usize = 4;

pub const Points = struct {
    raw: []const u8,

    pub fn parse(bytes: []const u8) !Points {
        if (bytes.len % width != 0) return error.InvalidEmfPointSArraySize;
        return .{ .raw = bytes };
    }

    pub fn count(self: Points) usize {
        return self.raw.len / width;
    }

    pub fn get(self: Points, index: usize) !geometry.PointS {
        if (index >= self.count()) return error.EmfPointSIndexOutOfBounds;
        return geometry.parsePointS(self.raw[index * width ..][0..width]);
    }
};

test "PointS array borrows exact records and checks indexes" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 8;
    std.mem.writeInt(i16, bytes[0..2], -2, .little);
    std.mem.writeInt(i16, bytes[2..4], 3, .little);
    const points = try Points.parse(&bytes);
    try std.testing.expectEqual(@as(usize, 2), points.count());
    try std.testing.expectEqual(@as(i16, -2), (try points.get(0)).x);
    try std.testing.expectEqual(@as(i16, 3), (try points.get(0)).y);
    try std.testing.expectError(error.EmfPointSIndexOutOfBounds, points.get(2));
    try std.testing.expectError(error.InvalidEmfPointSArraySize, Points.parse(bytes[0..7]));
}
