const std = @import("std");
const t = std.testing;
const records = @import("records.zig");
const pen = @import("pen.zig");
const brush = @import("brush.zig");
const font = @import("font.zig");

fn record(function: u16, size_words: u32, parameters: []const u8) records.Record {
    return .{ .offset = 0, .size_words = size_words, .function = function, .parameters = parameters, .end = @as(usize, size_words) * 2 };
}

test "WMF pen preserves signed width and explicit ColorRef policy" {
    const bytes = [_]u8{ 6, 0, 0xff, 0xff, 2, 0, 1, 2, 3, 2 };
    const value = try pen.parse(record(0x02fa, 8, &bytes), .observed_preserve);
    try t.expectEqual(@as(u16, 6), value.style_raw);
    try t.expectEqual(@as(i16, -1), value.width_x);
    try t.expectEqual(@as(i16, 2), value.width_y);
    try t.expectEqual(@as(u32, 0x02030201), value.color.raw);
    try t.expectError(error.InvalidWmfColorReserved, pen.parse(record(0x02fa, 8, &bytes), .specified_zero));
}

test "WMF brush validates style and hatched value without erasing ignored fields" {
    const bytes = [_]u8{ 2, 0, 3, 4, 5, 0, 5, 0 };
    const value = try brush.parse(record(0x02fc, 7, &bytes), .specified_zero);
    try t.expectEqual(@as(u16, 2), value.style_raw);
    try t.expectEqual(@as(u16, 5), value.hatch_raw);
    try t.expectEqual(@as(u8, 3), value.color.red);
    var malformed = bytes;
    malformed[6] = 6;
    try t.expectError(error.UnsupportedWmfHatchStyle, brush.parse(record(0x02fc, 7, &malformed), .specified_zero));
    malformed[0] = 0;
    const ignored = try brush.parse(record(0x02fc, 7, &malformed), .specified_zero);
    try t.expectEqual(@as(u16, 6), ignored.hatch_raw);
}

test "WMF font keeps raw face bytes and validates mandatory fields" {
    var bytes = [_]u8{0} ** 50;
    std.mem.writeInt(i16, bytes[0..2], -112, .little);
    std.mem.writeInt(i16, bytes[8..10], 400, .little);
    bytes[13] = 129;
    bytes[15] = 0x40;
    bytes[17] = 0x12;
    @memcpy(bytes[18..22], &[_]u8{ 0xb1, 0xbc, 0xb8, 0xb2 });
    bytes[23] = 0xaa;
    const value = try font.parse(record(0x02fb, 28, &bytes));
    try t.expectEqual(@as(i16, -112), value.height);
    try t.expectEqual(@as(u8, 129), value.char_set);
    try t.expectEqualSlices(u8, &.{ 0xb1, 0xbc, 0xb8, 0xb2 }, value.face_name);
    try t.expectEqual(@as(usize, 32), value.face_name_raw.len);
    try t.expectEqual(@as(u8, 0xaa), value.face_name_raw[5]);

    var malformed = bytes;
    malformed[10] = 2;
    try t.expectError(error.InvalidWmfFontBoolean, font.parse(record(0x02fb, 28, &malformed)));
    malformed = bytes;
    @memset(malformed[18..50], 'A');
    try t.expectError(error.UnterminatedWmfFaceName, font.parse(record(0x02fb, 28, &malformed)));
}

test "WMF mandatory pen brush and font domains reject exact boundaries" {
    var pen_bytes = [_]u8{0} ** 10;
    std.mem.writeInt(u16, pen_bytes[0..2], 0x2108, .little);
    _ = try pen.parse(record(0x02fa, 8, &pen_bytes), .specified_zero);
    std.mem.writeInt(u16, pen_bytes[0..2], 9, .little);
    try t.expectError(error.UnsupportedWmfPenStyle, pen.parse(record(0x02fa, 8, &pen_bytes), .specified_zero));

    var brush_bytes = [_]u8{0} ** 8;
    std.mem.writeInt(u16, brush_bytes[0..2], 10, .little);
    try t.expectError(error.UnsupportedWmfBrushStyle, brush.parse(record(0x02fc, 7, &brush_bytes), .specified_zero));

    var font_bytes = [_]u8{0} ** 50;
    std.mem.writeInt(i16, font_bytes[8..10], -1, .little);
    try t.expectError(error.InvalidWmfFontWeight, font.parse(record(0x02fb, 28, &font_bytes)));
    std.mem.writeInt(i16, font_bytes[8..10], 1001, .little);
    try t.expectError(error.InvalidWmfFontWeight, font.parse(record(0x02fb, 28, &font_bytes)));
    std.mem.writeInt(i16, font_bytes[8..10], 1000, .little);
    font_bytes[14] = 2;
    try t.expectError(error.UnsupportedWmfOutPrecision, font.parse(record(0x02fb, 28, &font_bytes)));
    font_bytes[14] = 10;
    font_bytes[15] = 4;
    try t.expectError(error.UnsupportedWmfClipPrecision, font.parse(record(0x02fb, 28, &font_bytes)));
    font_bytes[15] = 0xf3;
    font_bytes[16] = 6;
    try t.expectError(error.UnsupportedWmfFontQuality, font.parse(record(0x02fb, 28, &font_bytes)));
    font_bytes[16] = 5;
    _ = try font.parse(record(0x02fb, 28, &font_bytes));
}

test "WMF create payloads require exact function and record size" {
    const pen_bytes = [_]u8{0} ** 10;
    try t.expectError(error.InvalidWmfPenFunction, pen.parse(record(0x02fb, 8, &pen_bytes), .specified_zero));
    try t.expectError(error.InvalidWmfPenSize, pen.parse(record(0x02fa, 7, &pen_bytes), .specified_zero));
    const brush_bytes = [_]u8{0} ** 8;
    try t.expectError(error.InvalidWmfBrushSize, brush.parse(record(0x02fc, 8, &brush_bytes), .specified_zero));
    const font_bytes = [_]u8{0} ** 50;
    try t.expectError(error.InvalidWmfFontSize, font.parse(record(0x02fb, 27, &font_bytes)));
}
