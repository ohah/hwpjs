const binary = @import("../../binary/reader.zig");

pub const EncodedInteger = struct {
    value: i16,
    width: u2,
};

pub fn read(reader: *binary.Reader) !EncodedInteger {
    var next = reader.*;
    const first = try next.readInt(u8);
    const result: EncodedInteger = if (first & 0x80 == 0)
        .{ .value = signExtend7(first), .width = 1 }
    else blk: {
        const second = try next.readInt(u8);
        var raw = (@as(u16, first & 0x7f) << 8) | second;
        if (raw & 0x4000 != 0) raw |= 0x8000;
        break :blk .{ .value = @bitCast(raw), .width = 2 };
    };
    reader.* = next;
    return result;
}

fn signExtend7(raw: u8) i16 {
    var extended: u16 = raw & 0x7f;
    if (extended & 0x40 != 0) extended |= 0xff80;
    return @bitCast(extended);
}

test "EMF+ Integer7 decodes every signed value" {
    const std = @import("std");
    var storage: [1]u8 = undefined;
    var value: i16 = -64;
    while (value <= 63) : (value += 1) {
        storage[0] = @as(u8, @truncate(@as(u16, @bitCast(value)))) & 0x7f;
        var reader: binary.Reader = .{ .bytes = &storage };
        const decoded = try read(&reader);
        try std.testing.expectEqual(value, decoded.value);
        try std.testing.expectEqual(@as(u2, 1), decoded.width);
        try std.testing.expectEqual(@as(usize, 1), reader.offset);
    }
}

test "EMF+ Integer15 decodes every signed value including noncanonical small values" {
    const std = @import("std");
    var storage: [2]u8 = undefined;
    var value: i32 = -16_384;
    while (value <= 16_383) : (value += 1) {
        const raw = @as(u16, @bitCast(@as(i16, @intCast(value)))) & 0x7fff;
        storage = .{ 0x80 | @as(u8, @truncate(raw >> 8)), @truncate(raw) };
        var reader: binary.Reader = .{ .bytes = &storage };
        const decoded = try read(&reader);
        try std.testing.expectEqual(@as(i16, @intCast(value)), decoded.value);
        try std.testing.expectEqual(@as(u2, 2), decoded.width);
        try std.testing.expectEqual(@as(usize, 2), reader.offset);
    }
}

test "EMF+ Integer15 truncation leaves the reader unchanged" {
    const std = @import("std");
    var reader: binary.Reader = .{ .bytes = &.{0x80} };
    try std.testing.expectError(error.UnexpectedEnd, read(&reader));
    try std.testing.expectEqual(@as(usize, 0), reader.offset);
}
