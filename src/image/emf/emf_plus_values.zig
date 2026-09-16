const binary = @import("../../binary/reader.zig");

pub fn readFloat(reader: *binary.Reader) !f32 {
    return @bitCast(try reader.readInt(u32));
}

pub fn floatAt(bytes: []const u8, index: usize) f32 {
    const std = @import("std");
    return @bitCast(std.mem.readInt(u32, bytes[index * 4 ..][0..4], .little));
}

test "EMF+ float helpers preserve IEEE 754 bits" {
    const std = @import("std");
    const bits = [_]u8{ 0x01, 0x00, 0xc0, 0x7f };
    var reader: binary.Reader = .{ .bytes = &bits };
    const value = try readFloat(&reader);
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(value)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(floatAt(&bits, 0))));
}
