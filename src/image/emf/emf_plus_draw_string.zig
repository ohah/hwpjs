const std = @import("std");
const binary = @import("../../binary/reader.zig");
const utf16 = @import("../../text/utf16.zig");
const brush_id = @import("emf_plus_brush_id.zig");
const geometry = @import("emf_plus_geometry.zig");
const optional_object_id = @import("emf_plus_optional_object_id.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const Options = struct {
    max_string_units: u32 = 16 * 1024 * 1024,
};

pub const DrawString = struct {
    flags: u16,
    font_id: u6,
    brush: brush_id.BrushIdOrColor,
    format: optional_object_id.OptionalObjectId,
    length: u32,
    layout_rectangle: geometry.RectF,
    string_utf16le: []const u8,
    string_stats: utf16.Stats,
    alignment_padding: []const u8,
};

pub fn parse(value: record.Record, options: Options) !DrawString {
    if (value.kind != .draw_string) return error.NotEmfPlusDrawString;
    if (value.size < 40 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusDrawStringSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const raw_brush = try reader.readInt(u32);
    const raw_format = try reader.readInt(u32);
    const length = try reader.readInt(u32);
    if (length < 1) return error.InvalidEmfPlusDrawStringLength;
    if (length > options.max_string_units) return error.LimitExceeded;
    const layout_rectangle = try geometry.readRectF(&reader);
    const string_bytes = std.math.mul(usize, @as(usize, length), 2) catch return error.LimitExceeded;
    const semantic_size = std.math.add(usize, 28, string_bytes) catch return error.LimitExceeded;
    const expected_size = std.mem.alignForward(usize, semantic_size, 4);
    if (value.data.len != expected_size) return error.InvalidEmfPlusDrawStringSize;
    const string_utf16le = try reader.take(string_bytes);
    const string_stats = utf16.inspect(string_utf16le, .little) catch return error.InvalidEmfPlusDrawStringUnicode;
    const alignment_padding = value.data[reader.offset..];
    if (alignment_padding.len > 3) return error.InvalidEmfPlusDrawStringPadding;

    return .{
        .flags = value.flags,
        .font_id = try record_flags.objectId(value.flags),
        .brush = try brush_id.parse(raw_brush, value.flags),
        .format = optional_object_id.parse(raw_format),
        .length = length,
        .layout_rectangle = layout_rectangle,
        .string_utf16le = string_utf16le,
        .string_stats = string_stats,
        .alignment_padding = alignment_padding,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_string,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ DrawString parses literal color optional format odd string and padding" {
    var data = [_]u8{0} ** 32;
    putU32(&data, 0, 0x44332211);
    putU32(&data, 4, 0xffff_ffff);
    putU32(&data, 8, 1);
    for ([_]f32{ -0.0, std.math.nan(f32), std.math.inf(f32), -4.5 }, 0..) |value, index|
        putF32(&data, 12 + index * 4, value);
    std.mem.writeInt(u16, data[28..30], 'A', .little);
    data[30..32].* = .{ 0xaa, 0xbb };
    const parsed = try parse(makeRecord(&data, 0x803f), .{});
    try std.testing.expectEqual(@as(u16, 0x803f), parsed.flags);
    try std.testing.expectEqual(@as(u6, 63), parsed.font_id);
    try std.testing.expectEqual(@as(u32, 0x44332211), parsed.brush.color.raw());
    try std.testing.expectEqual(@as(u32, 0xffff_ffff), parsed.format.raw);
    try std.testing.expect(parsed.format.object_id == null);
    try std.testing.expectEqual(@as(u32, 1), parsed.length);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(parsed.layout_rectangle.x)));
    try std.testing.expect(std.math.isNan(parsed.layout_rectangle.y));
    try std.testing.expectEqual(@as(usize, 1), parsed.string_stats.scalars);
    try std.testing.expectEqualSlices(u8, "\xaa\xbb", parsed.alignment_padding);
}

test "EMF+ DrawString parses Brush StringFormat and surrogate pair references" {
    var data = [_]u8{0} ** 32;
    putU32(&data, 0, 7);
    putU32(&data, 4, 63);
    putU32(&data, 8, 2);
    data[28..32].* = .{ 0x3d, 0xd8, 0x00, 0xde };
    const parsed = try parse(makeRecord(&data, 5), .{});
    try std.testing.expectEqual(@as(u6, 5), parsed.font_id);
    try std.testing.expectEqual(@as(u6, 7), parsed.brush.brush_id);
    try std.testing.expectEqual(@as(?u6, 63), parsed.format.object_id);
    try std.testing.expectEqual(@as(u32, 2), parsed.length);
    try std.testing.expectEqual(@as(usize, 1), parsed.string_stats.scalars);
    try std.testing.expectEqual(@as(usize, 0), parsed.alignment_padding.len);
}

test "EMF+ DrawString preserves NUL and BOM code units without terminator semantics" {
    var data = [_]u8{0} ** 32;
    putU32(&data, 4, 64);
    putU32(&data, 8, 2);
    data[28..32].* = .{ 0, 0, 0xff, 0xfe };
    const parsed = try parse(makeRecord(&data, 0x8000), .{});
    try std.testing.expectEqual(@as(usize, 2), parsed.string_stats.scalars);
    try std.testing.expectEqual(@as(usize, 1), parsed.string_stats.nul_scalars);
    try std.testing.expectEqual(@as(usize, 1), parsed.string_stats.bom_scalars);
    try std.testing.expect(!parsed.string_stats.ends_in_nul);
    try std.testing.expectEqualSlices(u8, data[28..32], parsed.string_utf16le);
}

test "EMF+ DrawString rejects type domains every size boundary and independent axes" {
    var data = [_]u8{0} ** 32;
    putU32(&data, 8, 2);
    data[28..32].* = .{ 'A', 0, 'B', 0 };
    _ = try parse(makeRecord(&data, 0x8000), .{});
    for (0..data.len + 1) |cut| {
        if (cut != 32)
            try std.testing.expectError(error.InvalidEmfPlusDrawStringSize, parse(makeRecord(data[0..cut], 0x8000), .{}));
    }
    var zero_length = data;
    putU32(&zero_length, 8, 0);
    try std.testing.expectError(error.InvalidEmfPlusDrawStringLength, parse(makeRecord(&zero_length, 0x8000), .{}));
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&data, 0x8000), .{ .max_string_units = 1 }));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(&data, 0x8040), .{}));
    var bad_brush = data;
    putU32(&bad_brush, 0, 64);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(&bad_brush, 0), .{}));
    var bad_unicode = data;
    putU32(&bad_unicode, 8, 1);
    bad_unicode[28..32].* = .{ 0x00, 0xd8, 0xaa, 0xbb };
    try std.testing.expectError(error.InvalidEmfPlusDrawStringUnicode, parse(makeRecord(&bad_unicode, 0x8000), .{}));
    var wrong_type = makeRecord(&data, 0x8000);
    wrong_type.kind = .draw_driver_string;
    try std.testing.expectError(error.NotEmfPlusDrawString, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&data, 0x8000);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawStringSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&data, 0x8000);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawStringSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(&data, 0x8000);
    wrong_slice.size = 40;
    wrong_slice.data_size = 28;
    try std.testing.expectError(error.InvalidEmfPlusDrawStringSize, parse(wrong_slice, .{}));
}
