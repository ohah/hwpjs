const point_s = @import("point_s.zig");

pub const Points = struct {
    bytes: []const u8,
    count: usize,

    pub fn get(self: Points, index: usize) !point_s.Point {
        if (index >= self.count) return error.WmfPointIndexOutOfBounds;
        const offset = index * 4;
        return point_s.readXY(self.bytes[offset..][0..4]);
    }
};

pub fn fromExact(bytes: []const u8, count: usize) !Points {
    if (count > bytes.len / 4 or count * 4 != bytes.len) return error.InvalidWmfPointArraySize;
    return .{ .bytes = bytes, .count = count };
}
