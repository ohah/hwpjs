const std = @import("std");

/// Bounded byte reader; a failed read leaves the cursor unchanged.
pub const Reader = struct {
    bytes: []const u8,
    offset: usize = 0,

    pub fn take(self: *Reader, count: usize) error{UnexpectedEnd}![]const u8 {
        if (self.offset > self.bytes.len or count > self.bytes.len - self.offset)
            return error.UnexpectedEnd;
        const start = self.offset;
        self.offset += count;
        return self.bytes[start..self.offset];
    }

    pub fn readInt(self: *Reader, comptime T: type) error{UnexpectedEnd}!T {
        const bytes = try self.take(@sizeOf(T));
        return std.mem.readInt(T, bytes[0..@sizeOf(T)], .little);
    }
};

test "little-endian integer reads consume only their bytes" {
    var reader: Reader = .{ .bytes = &.{ 0x34, 0x12, 0x78, 0x56, 0x34, 0x12 } };
    try std.testing.expectEqual(@as(u16, 0x1234), try reader.readInt(u16));
    try std.testing.expectEqual(@as(u32, 0x12345678), try reader.readInt(u32));
    try std.testing.expectEqual(@as(usize, 6), reader.offset);
}

test "truncated and oversized reads preserve the cursor" {
    var reader: Reader = .{ .bytes = &.{ 1, 2 } };
    try std.testing.expectError(error.UnexpectedEnd, reader.readInt(u32));
    try std.testing.expectError(error.UnexpectedEnd, reader.take(std.math.maxInt(usize)));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    _ = try reader.take(2);
    try std.testing.expectError(error.UnexpectedEnd, reader.take(1));
    try std.testing.expectEqual(@as(usize, 2), reader.offset);
}
