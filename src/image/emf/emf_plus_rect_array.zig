const std = @import("std");
const binary = @import("../../binary/reader.zig");
const rect_data = @import("emf_plus_rect_data.zig");

pub const Options = struct {
    max_rectangles: u32 = 16 * 1024 * 1024,
};

pub const RectArray = struct {
    count: u32,
    compressed: bool,
    bytes: []const u8,

    pub fn rectangles(self: RectArray) Iterator {
        return .{
            .reader = .{ .bytes = self.bytes },
            .compressed = self.compressed,
            .remaining = self.count,
        };
    }
};

pub const Iterator = struct {
    reader: binary.Reader,
    compressed: bool,
    remaining: u32,

    pub fn next(self: *Iterator) !?rect_data.RectData {
        if (self.remaining == 0) return null;
        const rectangle = try rect_data.read(&self.reader, self.compressed);
        self.remaining -= 1;
        return rectangle;
    }
};

pub fn parse(bytes: []const u8, count: u32, compressed: bool, options: Options) !RectArray {
    if (count < 1) return error.InvalidEmfPlusRectArrayCount;
    if (count > options.max_rectangles) return error.LimitExceeded;
    const width: usize = if (compressed) 8 else 16;
    const expected = std.math.mul(usize, @as(usize, count), width) catch return error.LimitExceeded;
    if (bytes.len != expected) return error.InvalidEmfPlusRectArraySize;
    return .{ .count = count, .compressed = compressed, .bytes = bytes };
}

test "EMF+ RectArray preserves integer and floating rectangle sequences" {
    var integer_bytes = [_]u8{0} ** 16;
    for ([_]i16{ -32768, -1, 0, 32767, 1, 2, 3, 4 }, 0..) |value, index|
        std.mem.writeInt(i16, integer_bytes[index * 2 ..][0..2], value, .little);
    const integers = try parse(&integer_bytes, 2, true, .{});
    var integer_iterator = integers.rectangles();
    try std.testing.expectEqual(@as(i16, -32768), (try integer_iterator.next()).?.compressed.x);
    try std.testing.expectEqual(@as(i16, 4), (try integer_iterator.next()).?.compressed.height);
    try std.testing.expect((try integer_iterator.next()) == null);

    var float_bytes = [_]u8{0} ** 16;
    for ([_]f32{ -0.0, std.math.nan(f32), std.math.inf(f32), -4.5 }, 0..) |value, index|
        std.mem.writeInt(u32, float_bytes[index * 4 ..][0..4], @bitCast(value), .little);
    const floats = try parse(&float_bytes, 1, false, .{});
    var float_iterator = floats.rectangles();
    const rectangle = (try float_iterator.next()).?.float;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(rectangle.x)));
    try std.testing.expect(std.math.isNan(rectangle.y));
    try std.testing.expect(std.math.isPositiveInf(rectangle.width));
}

test "EMF+ RectArray rejects count size and limit independently" {
    var bytes = [_]u8{0} ** 17;
    try std.testing.expectError(error.InvalidEmfPlusRectArrayCount, parse(bytes[0..0], 0, true, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(bytes[0..8], 1, true, .{ .max_rectangles = 0 }));
    for (0..bytes.len + 1) |length| {
        if (length != 8)
            try std.testing.expectError(error.InvalidEmfPlusRectArraySize, parse(bytes[0..length], 1, true, .{}));
        if (length != 16)
            try std.testing.expectError(error.InvalidEmfPlusRectArraySize, parse(bytes[0..length], 1, false, .{}));
    }
}
