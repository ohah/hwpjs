const std = @import("std");
const values = @import("font_values.zig");
const font_string = @import("font_string.zig");

pub const size = 92;
pub const LogFont = struct {
    height: i32,
    width: i32,
    escapement: i32,
    orientation: i32,
    weight: i32,
    italic: bool,
    underline: bool,
    strike_out: bool,
    character_set: values.CharacterSet,
    out_precision: values.OutPrecision,
    clip_precision: u8,
    quality: values.Quality,
    pitch_and_family: values.PitchAndFamily,
    face_name: font_string.String,
};

fn boolean(value: u8) !bool {
    return switch (value) {
        0 => false,
        1 => true,
        else => error.InvalidEmfFontBoolean,
    };
}

pub fn parse(bytes: []const u8) !LogFont {
    if (bytes.len != size) return error.InvalidEmfLogFontSize;
    const weight = std.mem.readInt(i32, bytes[16..20], .little);
    if (weight < 0 or weight > 1000) return error.InvalidEmfFontWeight;
    return .{
        .height = std.mem.readInt(i32, bytes[0..4], .little),
        .width = std.mem.readInt(i32, bytes[4..8], .little),
        .escapement = std.mem.readInt(i32, bytes[8..12], .little),
        .orientation = std.mem.readInt(i32, bytes[12..16], .little),
        .weight = weight,
        .italic = try boolean(bytes[20]),
        .underline = try boolean(bytes[21]),
        .strike_out = try boolean(bytes[22]),
        .character_set = try values.characterSet(bytes[23]),
        .out_precision = try values.outPrecision(bytes[24]),
        .clip_precision = try values.clipPrecision(bytes[25]),
        .quality = try values.quality(bytes[26]),
        .pitch_and_family = try values.pitchAndFamily(bytes[27]),
        .face_name = try font_string.parse(bytes[28..92]),
    };
}

fn initValid(bytes: []u8) void {
    std.debug.assert(bytes.len == size);
    @memset(bytes, 0);
    std.mem.writeInt(i32, bytes[16..20], 400, .little);
}

test "LogFont parses signed metrics and validates mandatory value domains" {
    var bytes: [size]u8 = undefined;
    initValid(&bytes);
    std.mem.writeInt(i32, bytes[0..4], -12, .little);
    bytes[20] = 1;
    bytes[23] = 0x81;
    bytes[24] = 4;
    bytes[25] = 0xf3;
    bytes[26] = 5;
    bytes[27] = 0x52;
    std.mem.writeInt(u16, bytes[28..30], 'A', .little);
    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(i32, -12), value.height);
    try std.testing.expect(value.italic);
    try std.testing.expectEqual(values.CharacterSet.hangul, value.character_set);
    try std.testing.expectEqual(@as(usize, 2), value.face_name.value.len);
    try std.testing.expectError(error.InvalidEmfLogFontSize, parse(bytes[0..91]));
    bytes[20] = 2;
    try std.testing.expectError(error.InvalidEmfFontBoolean, parse(&bytes));
}

test "LogFont rejects every constrained field independently" {
    var bytes: [size]u8 = undefined;
    const t = std.testing;
    initValid(&bytes);
    std.mem.writeInt(i32, bytes[16..20], -1, .little);
    try t.expectError(error.InvalidEmfFontWeight, parse(&bytes));
    std.mem.writeInt(i32, bytes[16..20], 1001, .little);
    try t.expectError(error.InvalidEmfFontWeight, parse(&bytes));
    std.mem.writeInt(i32, bytes[16..20], 400, .little);
    for (20..23) |offset| {
        bytes[offset] = 2;
        try t.expectError(error.InvalidEmfFontBoolean, parse(&bytes));
        bytes[offset] = 0;
    }
    const fields = [_]struct { offset: usize, value: u8, expected: anyerror }{
        .{ .offset = 23, .value = 3, .expected = error.InvalidEmfFontCharacterSet },
        .{ .offset = 24, .value = 2, .expected = error.InvalidEmfFontOutPrecision },
        .{ .offset = 25, .value = 4, .expected = error.InvalidEmfFontClipPrecision },
        .{ .offset = 26, .value = 6, .expected = error.InvalidEmfFontQuality },
        .{ .offset = 27, .value = 3, .expected = error.InvalidEmfFontPitchAndFamily },
    };
    for (fields) |field| {
        bytes[field.offset] = field.value;
        try t.expectError(field.expected, parse(&bytes));
        bytes[field.offset] = 0;
    }
    bytes[28..32].* = .{ 0, 0xd8, 0, 0xd8 };
    try t.expectError(error.InvalidEmfFontStringEncoding, parse(&bytes));
}
