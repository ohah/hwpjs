const std = @import("std");

pub const CharacterSet = enum(u8) {
    ansi = 0x00,
    default = 0x01,
    symbol = 0x02,
    mac = 0x4d,
    shift_jis = 0x80,
    hangul = 0x81,
    johab = 0x82,
    gb2312 = 0x86,
    chinese_big5 = 0x88,
    greek = 0xa1,
    turkish = 0xa2,
    vietnamese = 0xa3,
    hebrew = 0xb1,
    arabic = 0xb2,
    baltic = 0xba,
    russian = 0xcc,
    thai = 0xde,
    east_europe = 0xee,
    oem = 0xff,
};

pub const OutPrecision = enum(u8) {
    default = 0,
    string = 1,
    stroke = 3,
    true_type = 4,
    device = 5,
    raster = 6,
    true_type_only = 7,
    outline = 8,
    screen_outline = 9,
    postscript_only = 10,
};

pub const Quality = enum(u8) { default = 0, draft = 1, proof = 2, non_antialiased = 3, antialiased = 4, clear_type = 5 };
pub const Pitch = enum(u8) { default = 0, fixed = 1, variable = 2 };
pub const Family = enum(u8) { dont_care = 0, roman = 1, swiss = 2, modern = 3, script = 4, decorative = 5 };
pub const PitchAndFamily = struct { raw: u8, pitch: Pitch, family: Family };

pub fn characterSet(value: u8) !CharacterSet {
    return std.enums.fromInt(CharacterSet, value) orelse error.InvalidEmfFontCharacterSet;
}
pub fn outPrecision(value: u8) !OutPrecision {
    return std.enums.fromInt(OutPrecision, value) orelse error.InvalidEmfFontOutPrecision;
}
pub fn quality(value: u8) !Quality {
    return std.enums.fromInt(Quality, value) orelse error.InvalidEmfFontQuality;
}
pub fn clipPrecision(value: u8) !u8 {
    if (value & 0x0c != 0) return error.InvalidEmfFontClipPrecision;
    return value;
}
pub fn pitchAndFamily(value: u8) !PitchAndFamily {
    if (value & 0x0c != 0) return error.InvalidEmfFontPitchAndFamily;
    return .{
        .raw = value,
        .pitch = std.enums.fromInt(Pitch, value & 0x03) orelse return error.InvalidEmfFontPitchAndFamily,
        .family = std.enums.fromInt(Family, value >> 4) orelse return error.InvalidEmfFontPitchAndFamily,
    };
}

test "font value domains preserve exact sparse and packed values" {
    const t = std.testing;
    for ([_]u8{ 0, 1, 2, 0x4d, 0x80, 0x81, 0x82, 0x86, 0x88, 0xa1, 0xa2, 0xa3, 0xb1, 0xb2, 0xba, 0xcc, 0xde, 0xee, 0xff }) |value|
        try t.expectEqual(value, @intFromEnum(try characterSet(value)));
    for ([_]u8{ 3, 0x4c, 0x83, 0xfe }) |value| try t.expectError(error.InvalidEmfFontCharacterSet, characterSet(value));
    for ([_]u8{ 0, 1, 3, 4, 5, 6, 7, 8, 9, 10 }) |value| try t.expectEqual(value, @intFromEnum(try outPrecision(value)));
    for ([_]u8{ 2, 11, 255 }) |value| try t.expectError(error.InvalidEmfFontOutPrecision, outPrecision(value));
    for (0..6) |value| try t.expectEqual(value, @intFromEnum(try quality(@intCast(value))));
    try t.expectError(error.InvalidEmfFontQuality, quality(6));
    _ = try clipPrecision(0xf3);
    try t.expectError(error.InvalidEmfFontClipPrecision, clipPrecision(0x04));
    for (0..6) |family_value| for (0..3) |pitch_value| {
        const raw: u8 = @intCast(family_value * 16 + pitch_value);
        const value = try pitchAndFamily(raw);
        try t.expectEqual(raw, value.raw);
    };
    for ([_]u8{ 3, 4, 0x60 }) |value| try t.expectError(error.InvalidEmfFontPitchAndFamily, pitchAndFamily(value));
}
