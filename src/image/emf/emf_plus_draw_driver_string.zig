const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush_id = @import("emf_plus_brush_id.zig");
const driver_options = @import("emf_plus_driver_string_options.zig");
const point = @import("emf_plus_point.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub const Options = struct {
    max_glyphs: u32 = 16 * 1024 * 1024,
};

pub const GlyphIterator = struct {
    bytes: []const u8,
    index: u32 = 0,

    pub fn next(self: *GlyphIterator) ?u16 {
        const byte_offset = std.math.mul(usize, @as(usize, self.index), 2) catch return null;
        if (byte_offset == self.bytes.len) return null;
        self.index += 1;
        return std.mem.readInt(u16, self.bytes[byte_offset..][0..2], .little);
    }
};

pub const DrawDriverString = struct {
    flags: u16,
    font_id: u6,
    brush: brush_id.BrushIdOrColor,
    options: driver_options.Options,
    matrix_present: bool,
    glyph_count: u32,
    glyph_data: []const u8,
    glyph_position_data: []const u8,
    transform: ?transform_matrix.TransformMatrix,
    alignment_padding: []const u8,

    pub fn glyphs(self: DrawDriverString) GlyphIterator {
        return .{ .bytes = self.glyph_data };
    }

    pub fn positions(self: DrawDriverString) point.Iterator {
        return .{
            .reader = .{ .bytes = self.glyph_position_data },
            .encoding = .floating,
            .remaining = self.glyph_count,
        };
    }
};

pub fn parse(value: record.Record, options: Options) !DrawDriverString {
    if (value.kind != .draw_driver_string) return error.NotEmfPlusDrawDriverString;
    if (value.size < 12 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusDrawDriverStringSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const raw_brush = try reader.readInt(u32);
    const parsed_options = try driver_options.parse(try reader.readInt(u32));
    const raw_matrix_present = try reader.readInt(u32);
    const matrix_present = switch (raw_matrix_present) {
        0 => false,
        1 => true,
        else => return error.InvalidEmfPlusDrawDriverStringMatrixPresent,
    };
    const glyph_count = try reader.readInt(u32);
    if (glyph_count > options.max_glyphs) return error.LimitExceeded;

    const glyph_bytes = std.math.mul(usize, @as(usize, glyph_count), 2) catch return error.LimitExceeded;
    const position_bytes = std.math.mul(usize, @as(usize, glyph_count), 8) catch return error.LimitExceeded;
    const variable_bytes = std.math.add(usize, glyph_bytes, position_bytes) catch return error.LimitExceeded;
    const matrix_bytes: usize = if (matrix_present) 24 else 0;
    const unaligned_size = std.math.add(usize, 16, variable_bytes) catch return error.LimitExceeded;
    const semantic_size = std.math.add(usize, unaligned_size, matrix_bytes) catch return error.LimitExceeded;
    const expected_size = std.mem.alignForward(usize, semantic_size, 4);
    if (value.data.len != expected_size) return error.InvalidEmfPlusDrawDriverStringSize;

    const glyph_data = try reader.take(glyph_bytes);
    const glyph_position_data = try reader.take(position_bytes);
    const transform = if (matrix_present) try transform_matrix.read(&reader) else null;
    const alignment_padding = value.data[reader.offset..];
    if (alignment_padding.len > 3) return error.InvalidEmfPlusDrawDriverStringPadding;

    return .{
        .flags = value.flags,
        .font_id = try record_flags.objectId(value.flags),
        .brush = try brush_id.parse(raw_brush, value.flags),
        .options = parsed_options,
        .matrix_present = matrix_present,
        .glyph_count = glyph_count,
        .glyph_data = glyph_data,
        .glyph_position_data = glyph_position_data,
        .transform = transform,
        .alignment_padding = alignment_padding,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_driver_string,
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

test "EMF+ DrawDriverString parses literal color even glyphs and positions" {
    var data = [_]u8{0} ** 36;
    putU32(&data, 0, 0x44332211);
    putU32(&data, 4, driver_options.cmap_lookup | driver_options.vertical);
    putU32(&data, 12, 2);
    std.mem.writeInt(u16, data[16..18], 0x0048, .little);
    std.mem.writeInt(u16, data[18..20], 0xd800, .little);
    for ([_]f32{ -0.0, std.math.inf(f32), 3.5, -4.5 }, 0..) |coordinate, index|
        putF32(&data, 20 + index * 4, coordinate);
    const value = try parse(makeRecord(&data, 0x803f), .{});
    try std.testing.expectEqual(@as(u6, 63), value.font_id);
    try std.testing.expectEqual(@as(u32, 0x44332211), value.brush.color.raw());
    try std.testing.expect(value.options.has(driver_options.cmap_lookup));
    try std.testing.expect(!value.matrix_present);
    try std.testing.expectEqual(@as(u32, 2), value.glyph_count);
    var glyphs = value.glyphs();
    try std.testing.expectEqual(@as(u16, 0x0048), glyphs.next().?);
    try std.testing.expectEqual(@as(u16, 0xd800), glyphs.next().?);
    try std.testing.expect(glyphs.next() == null);
    var positions = value.positions();
    const first = (try positions.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(first.x)));
    try std.testing.expect(std.math.isPositiveInf(first.y));
    try std.testing.expectEqual(@as(usize, 0), value.alignment_padding.len);
}

test "EMF+ DrawDriverString parses odd glyph layout brush reference matrix and padding" {
    var data = [_]u8{0} ** 52;
    putU32(&data, 0, 7);
    putU32(&data, 4, driver_options.realized_advance | driver_options.limit_subpixel);
    putU32(&data, 8, 1);
    putU32(&data, 12, 1);
    std.mem.writeInt(u16, data[16..18], 0xffff, .little);
    putF32(&data, 18, 1.25);
    putF32(&data, 22, -2.5);
    for ([_]f32{ 1, 2, 3, 4, 5, 6 }, 0..) |coordinate, index|
        putF32(&data, 26 + index * 4, coordinate);
    data[50..52].* = .{ 0xaa, 0xbb };
    const value = try parse(makeRecord(&data, 0x0005), .{});
    try std.testing.expectEqual(@as(u6, 5), value.font_id);
    try std.testing.expectEqual(@as(u6, 7), value.brush.brush_id);
    try std.testing.expect(value.options.has(driver_options.realized_advance));
    try std.testing.expect(value.matrix_present);
    try std.testing.expectEqual(@as(f32, 1), value.transform.?.m11);
    try std.testing.expectEqual(@as(f32, 6), value.transform.?.dy);
    try std.testing.expectEqualSlices(u8, "\xaa\xbb", value.alignment_padding);
}

test "EMF+ DrawDriverString accepts empty glyph arrays and rejects every boundary" {
    var empty = [_]u8{0} ** 16;
    const zero = try parse(makeRecord(&empty, 0x8000), .{});
    try std.testing.expectEqual(@as(u32, 0), zero.glyph_count);
    var zero_glyphs = zero.glyphs();
    try std.testing.expect(zero_glyphs.next() == null);

    for (0..16) |cut| {
        const result = parse(makeRecord(empty[0..cut], 0x8000), .{});
        if (result) |_| return error.TestExpectedError else |_| {}
    }
    var bad_options = empty;
    putU32(&bad_options, 4, 0x10);
    try std.testing.expectError(error.InvalidEmfPlusDriverStringOptions, parse(makeRecord(&bad_options, 0x8000), .{}));
    var bad_matrix = empty;
    putU32(&bad_matrix, 8, 2);
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringMatrixPresent, parse(makeRecord(&bad_matrix, 0x8000), .{}));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(&empty, 0x8040), .{}));
    var bad_brush = empty;
    putU32(&bad_brush, 0, 64);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(&bad_brush, 0), .{}));

    var one = [_]u8{0} ** 28;
    putU32(&one, 12, 1);
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&one, 0x8000), .{ .max_glyphs = 0 }));
    var missing_matrix = one;
    putU32(&missing_matrix, 8, 1);
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringSize, parse(makeRecord(&missing_matrix, 0x8000), .{}));
    var unexpected_matrix = [_]u8{0} ** 52;
    putU32(&unexpected_matrix, 12, 1);
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringSize, parse(makeRecord(&unexpected_matrix, 0x8000), .{}));
    var wrong_type = makeRecord(&empty, 0x8000);
    wrong_type.kind = .draw_string;
    try std.testing.expectError(error.NotEmfPlusDrawDriverString, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&empty, 0x8000);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&empty, 0x8000);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(empty[0..12], 0x8000);
    wrong_slice.size = 28;
    wrong_slice.data_size = 16;
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringSize, parse(wrong_slice, .{}));
}
