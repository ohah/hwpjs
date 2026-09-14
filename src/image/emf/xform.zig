const std = @import("std");

pub const byte_size = 24;

pub const Float = struct {
    bits: u32,

    pub fn value(self: Float) f32 {
        return @bitCast(self.bits);
    }
};

pub const XForm = struct {
    m11: Float,
    m12: Float,
    m21: Float,
    m22: Float,
    dx: Float,
    dy: Float,
};

fn float(bytes: []const u8) Float {
    return .{ .bits = std.mem.readInt(u32, bytes[0..4], .little) };
}

pub fn parse(bytes: []const u8) !XForm {
    if (bytes.len != byte_size) return error.InvalidEmfXFormSize;
    return .{
        .m11 = float(bytes[0..4]),
        .m12 = float(bytes[4..8]),
        .m21 = float(bytes[8..12]),
        .m22 = float(bytes[12..16]),
        .dx = float(bytes[16..20]),
        .dy = float(bytes[20..24]),
    };
}

test "XForm preserves all six FLOAT bit patterns in wire order" {
    const values = [_]u32{ 0x3f800000, 0x80000000, 0x7f800000, 0xff800000, 0x7fc01234, 0xc0200000 };
    var bytes = [_]u8{0} ** byte_size;
    for (values, 0..) |value, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], value, .little);
    const result = try parse(&bytes);
    try std.testing.expectEqual(values[0], result.m11.bits);
    try std.testing.expectEqual(values[1], result.m12.bits);
    try std.testing.expectEqual(values[2], result.m21.bits);
    try std.testing.expectEqual(values[3], result.m22.bits);
    try std.testing.expectEqual(values[4], result.dx.bits);
    try std.testing.expectEqual(values[5], result.dy.bits);
    try std.testing.expectEqual(@as(f32, 1.0), result.m11.value());
    try std.testing.expectEqual(@as(f32, -2.5), result.dy.value());
}

test "XForm requires exactly 24 bytes" {
    const bytes = [_]u8{0} ** (byte_size + 1);
    try std.testing.expectError(error.InvalidEmfXFormSize, parse(bytes[0 .. byte_size - 1]));
    try std.testing.expectError(error.InvalidEmfXFormSize, parse(&bytes));
}
