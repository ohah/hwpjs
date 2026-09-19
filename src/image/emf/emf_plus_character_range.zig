const std = @import("std");

pub const CharacterRange = struct {
    first: i32,
    length: i32,
};

pub const Ranges = struct {
    bytes: []const u8,
    count: u32,

    pub fn at(self: Ranges, index: u32) !CharacterRange {
        if (index >= self.count) return error.IndexOutOfBounds;
        const offset = @as(usize, index) * 8;
        return .{
            .first = std.mem.readInt(i32, self.bytes[offset..][0..4], .little),
            .length = std.mem.readInt(i32, self.bytes[offset + 4 ..][0..4], .little),
        };
    }
};

test "EMF+ CharacterRange preserves signed endpoints in a bounded view" {
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(i32, bytes[0..4], -2, .little);
    std.mem.writeInt(i32, bytes[4..8], 5, .little);
    std.mem.writeInt(i32, bytes[8..12], 7, .little);
    std.mem.writeInt(i32, bytes[12..16], -1, .little);
    const ranges: Ranges = .{ .bytes = &bytes, .count = 2 };
    try std.testing.expectEqual(@as(i32, -2), (try ranges.at(0)).first);
    try std.testing.expectEqual(@as(i32, 5), (try ranges.at(0)).length);
    try std.testing.expectEqual(@as(i32, -1), (try ranges.at(1)).length);
    try std.testing.expectError(error.IndexOutOfBounds, ranges.at(2));
}
