const binary = @import("../../binary/reader.zig");

pub const Argb = packed struct(u32) {
    blue: u8,
    green: u8,
    red: u8,
    alpha: u8,

    pub fn fromRaw(raw_value: u32) Argb {
        return @bitCast(raw_value);
    }

    pub fn raw(self: Argb) u32 {
        return @bitCast(self);
    }
};

pub fn read(reader: *binary.Reader) !Argb {
    return Argb.fromRaw(try reader.readInt(u32));
}

test "EMF+ ARGB maps wire bytes and preserves the raw value" {
    const std = @import("std");
    var reader: binary.Reader = .{ .bytes = &.{ 0x11, 0x22, 0x33, 0x44 } };
    const value = try read(&reader);
    try std.testing.expectEqual(@as(u8, 0x11), value.blue);
    try std.testing.expectEqual(@as(u8, 0x22), value.green);
    try std.testing.expectEqual(@as(u8, 0x33), value.red);
    try std.testing.expectEqual(@as(u8, 0x44), value.alpha);
    try std.testing.expectEqual(@as(u32, 0x44332211), value.raw());
    try std.testing.expectEqual(@as(usize, 4), reader.offset);
}

test "EMF+ ARGB truncation leaves the reader unchanged" {
    const std = @import("std");
    const bytes = [_]u8{ 1, 2, 3 };
    for (0..4) |cut| {
        var reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, read(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
}
