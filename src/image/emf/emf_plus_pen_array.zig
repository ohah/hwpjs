const binary = @import("../../binary/reader.zig");
const std = @import("std");

pub const FloatArray = struct {
    count: u32,
    data: []const u8,

    pub fn get(self: FloatArray, index: usize) ?f32 {
        if (index >= self.count) return null;
        const start = index * 4;
        return @bitCast(std.mem.readInt(u32, self.data[start..][0..4], .little));
    }
};

pub fn read(reader: *binary.Reader, max_elements: usize) !FloatArray {
    var next = reader.*;
    const count = try next.readInt(u32);
    if (@as(u64, count) > max_elements) return error.LimitExceeded;
    const byte_count = std.math.mul(usize, @intCast(count), 4) catch return error.LimitExceeded;
    const data = try next.take(byte_count);
    const result: FloatArray = .{ .count = count, .data = data };
    reader.* = next;
    return result;
}

pub fn readCompound(reader: *binary.Reader, max_elements: usize) !FloatArray {
    var next = reader.*;
    const result = try read(&next, max_elements);
    var previous: ?f32 = null;
    for (0..result.count) |index| {
        const value = result.get(index).?;
        if (!(value >= 0 and value <= 1)) return error.InvalidEmfPlusCompoundLineValue;
        if (previous) |prior| if (!(value > prior)) return error.InvalidEmfPlusCompoundLineOrder;
        previous = value;
    }
    reader.* = next;
    return result;
}

test "EMF+ pen float arrays are bounded borrowed and atomically validated" {
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(u32, bytes[0..4], 3, .little);
    for ([_]f32{ 0, 0.5, 1 }, 0..) |value, index| std.mem.writeInt(u32, bytes[4 + index * 4 ..][0..4], @bitCast(value), .little);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const result = try readCompound(&reader, 3);
    try std.testing.expectEqual(@as(f32, 0.5), result.get(1).?);
    try std.testing.expect(result.get(3) == null);
    try std.testing.expectEqual(@as(usize, 16), reader.offset);

    std.mem.writeInt(u32, bytes[8..12], @bitCast(@as(f32, 0)), .little);
    reader.offset = 0;
    try std.testing.expectError(error.InvalidEmfPlusCompoundLineOrder, readCompound(&reader, 3));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    std.mem.writeInt(u32, bytes[8..12], @bitCast(@as(f32, 0.5)), .little);
    reader.offset = 0;
    try std.testing.expectError(error.LimitExceeded, read(&reader, 2));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
    reader.bytes = bytes[0..15];
    try std.testing.expectError(error.UnexpectedEnd, read(&reader, 3));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);

    var one = [_]u8{0} ** 8;
    std.mem.writeInt(u32, one[0..4], 1, .little);
    for ([_]f32{ -0.25, 1.25, std.math.nan(f32) }) |invalid| {
        std.mem.writeInt(u32, one[4..8], @bitCast(invalid), .little);
        var invalid_reader: binary.Reader = .{ .bytes = &one };
        try std.testing.expectError(error.InvalidEmfPlusCompoundLineValue, readCompound(&invalid_reader, 1));
        try std.testing.expectEqual(@as(usize, 0), invalid_reader.offset);
    }
}
