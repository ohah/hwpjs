const std = @import("std");
const records = @import("records.zig");

pub const Font = struct {
    height: i16,
    width: i16,
    escapement: i16,
    orientation: i16,
    weight: i16,
    italic: u8,
    underline: u8,
    strike_out: u8,
    char_set: u8,
    out_precision: u8,
    clip_precision: u8,
    quality: u8,
    pitch_and_family: u8,
    face_name: []const u8,
    face_name_raw: *const [32]u8,
};

fn validOutPrecision(value: u8) bool {
    return value == 0 or value == 1 or (value >= 3 and value <= 10);
}

pub fn parse(record: records.Record) !Font {
    if (record.function != 0x02fb) return error.InvalidWmfFontFunction;
    if (record.size_words != 28 or record.parameters.len != 50) return error.InvalidWmfFontSize;
    const weight = std.mem.readInt(i16, record.parameters[8..10], .little);
    if (weight < 0 or weight > 1000) return error.InvalidWmfFontWeight;
    for (record.parameters[10..13]) |value| if (value > 1) return error.InvalidWmfFontBoolean;
    if (!validOutPrecision(record.parameters[14])) return error.UnsupportedWmfOutPrecision;
    if ((record.parameters[15] & 0x0c) != 0) return error.UnsupportedWmfClipPrecision;
    if (record.parameters[16] > 5) return error.UnsupportedWmfFontQuality;
    const face_name_raw: *const [32]u8 = record.parameters[18..50];
    const terminator = std.mem.indexOfScalar(u8, face_name_raw, 0) orelse return error.UnterminatedWmfFaceName;
    return .{
        .height = std.mem.readInt(i16, record.parameters[0..2], .little),
        .width = std.mem.readInt(i16, record.parameters[2..4], .little),
        .escapement = std.mem.readInt(i16, record.parameters[4..6], .little),
        .orientation = std.mem.readInt(i16, record.parameters[6..8], .little),
        .weight = weight,
        .italic = record.parameters[10],
        .underline = record.parameters[11],
        .strike_out = record.parameters[12],
        .char_set = record.parameters[13],
        .out_precision = record.parameters[14],
        .clip_precision = record.parameters[15],
        .quality = record.parameters[16],
        .pitch_and_family = record.parameters[17],
        .face_name = face_name_raw[0..terminator],
        .face_name_raw = face_name_raw,
    };
}
