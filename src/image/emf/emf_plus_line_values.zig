pub const CustomLineCapDataType = enum(i32) { default = 0, adjustable_arrow = 1 };

pub fn customLineCapDataType(raw: i32) !CustomLineCapDataType {
    return switch (raw) {
        0, 1 => @enumFromInt(raw),
        else => error.InvalidEmfPlusCustomLineCapDataType,
    };
}

pub const LineCapType = enum(u32) {
    flat = 0x00,
    square = 0x01,
    round = 0x02,
    triangle = 0x03,
    no_anchor = 0x10,
    square_anchor = 0x11,
    round_anchor = 0x12,
    diamond_anchor = 0x13,
    arrow_anchor = 0x14,
    anchor_mask = 0xf0,
    custom = 0xff,
};

pub fn lineCapType(raw: u32) !LineCapType {
    return switch (raw) {
        0x00...0x03, 0x10...0x14, 0xf0, 0xff => @enumFromInt(raw),
        else => error.InvalidEmfPlusLineCapType,
    };
}

pub const LineJoinType = enum(u32) { miter = 0, bevel = 1, round = 2, miter_clipped = 3 };

pub fn lineJoinType(raw: u32) !LineJoinType {
    if (raw > @intFromEnum(LineJoinType.miter_clipped)) return error.InvalidEmfPlusLineJoinType;
    return @enumFromInt(raw);
}

pub const CustomLineCapDataFlags = packed struct(u32) {
    fill_path: bool,
    line_path: bool,
    reserved: u30,

    pub fn fromRaw(raw_value: u32) CustomLineCapDataFlags {
        return @bitCast(raw_value);
    }

    pub fn raw(self: CustomLineCapDataFlags) u32 {
        return @bitCast(self);
    }
};

pub fn validateCustomLineCapDataFlags(raw: u32) !void {
    if (raw & ~@as(u32, 0x03) != 0) return error.InvalidEmfPlusCustomLineCapDataFlags;
}

test "EMF+ custom line cap enums and flags accept only official values" {
    const std = @import("std");
    try std.testing.expectEqual(CustomLineCapDataType.default, try customLineCapDataType(0));
    try std.testing.expectEqual(CustomLineCapDataType.adjustable_arrow, try customLineCapDataType(1));
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapDataType, customLineCapDataType(-1));
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapDataType, customLineCapDataType(2));
    for ([_]u32{ 0, 1, 2, 3, 0x10, 0x11, 0x12, 0x13, 0x14, 0xf0, 0xff }) |raw|
        try std.testing.expectEqual(raw, @intFromEnum(try lineCapType(raw)));
    for ([_]u32{ 4, 0x0f, 0x15, 0xef, 0xf1, 0xfe, 0x100, 0xffffffff }) |raw|
        try std.testing.expectError(error.InvalidEmfPlusLineCapType, lineCapType(raw));
    for (0..4) |raw|
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try lineJoinType(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusLineJoinType, lineJoinType(4));
    try std.testing.expectError(error.InvalidEmfPlusLineJoinType, lineJoinType(0xffffffff));
    try validateCustomLineCapDataFlags(3);
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapDataFlags, validateCustomLineCapDataFlags(4));
    try std.testing.expectEqual(@as(u32, 0xffff_ffff), CustomLineCapDataFlags.fromRaw(0xffff_ffff).raw());
}
