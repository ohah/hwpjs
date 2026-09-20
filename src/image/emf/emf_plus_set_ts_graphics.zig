const std = @import("std");
const binary = @import("../../binary/reader.zig");
const compositing_mode = @import("emf_plus_compositing_mode.zig");
const compositing_quality = @import("emf_plus_compositing_quality.zig");
const filter_type = @import("emf_plus_filter_type.zig");
const palette_data = @import("emf_plus_palette.zig");
const pixel_offset_mode = @import("emf_plus_pixel_offset_mode.zig");
const record = @import("emf_plus_record.zig");
const smoothing_mode = @import("emf_plus_smoothing_mode.zig");
const text_rendering_hint = @import("emf_plus_text_rendering_hint.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub const Options = struct { max_palette_entries: u32 = 1 << 20 };

pub const SetTSGraphics = struct {
    flags: u16,
    basic_vga: bool,
    anti_alias_mode: smoothing_mode.SmoothingMode,
    text_render_hint: text_rendering_hint.TextRenderingHint,
    compositing_mode: compositing_mode.CompositingMode,
    compositing_quality: compositing_quality.CompositingQuality,
    render_origin_x: i16,
    render_origin_y: i16,
    text_contrast: u16,
    filter_type: filter_type.FilterType,
    pixel_offset: pixel_offset_mode.PixelOffsetMode,
    world_to_device: transform_matrix.TransformMatrix,
    palette: ?palette_data.Palette,
};

pub fn parse(value: record.Record, options: Options) !SetTSGraphics {
    if (value.kind != .set_ts_graphics) return error.NotEmfPlusSetTSGraphics;
    const palette_present = value.flags & 0x0001 != 0;
    const basic_vga = value.flags & 0x0002 != 0;
    const minimum_data_size: u32 = if (palette_present) 44 else 36;
    if (value.data_size < minimum_data_size or @as(u64, value.size) != @as(u64, value.data_size) + record.header_size or value.data.len != value.data_size)
        return error.InvalidEmfPlusSetTSGraphicsSize;
    if (basic_vga and !palette_present) return error.EmfPlusSetTSGraphicsBasicVgaWithoutPalette;

    var reader: binary.Reader = .{ .bytes = value.data };
    const anti_alias = try smoothing_mode.SmoothingMode.parse(try reader.readInt(u8));
    const text_hint = try text_rendering_hint.TextRenderingHint.parse(try reader.readInt(u8));
    const compositing = try compositing_mode.CompositingMode.parse(try reader.readInt(u8));
    const quality = try compositing_quality.CompositingQuality.parse(try reader.readInt(u8));
    const origin_x = try reader.readInt(i16);
    const origin_y = try reader.readInt(i16);
    const text_contrast = try reader.readInt(u16);
    if (text_contrast > 12) return error.InvalidEmfPlusSetTSGraphicsTextContrast;
    const filter = try filter_type.FilterType.parse(try reader.readInt(u8));
    const pixel_offset = try pixel_offset_mode.PixelOffsetMode.parse(try reader.readInt(u8));
    const world_to_device = try transform_matrix.read(&reader);
    const palette = if (palette_present)
        try palette_data.read(&reader, .{ .max_entries = options.max_palette_entries })
    else
        null;
    if (reader.offset != value.data.len) return error.InvalidEmfPlusSetTSGraphicsSize;
    if (basic_vga) try validateBasicVga(palette.?);

    return .{
        .flags = value.flags,
        .basic_vga = basic_vga,
        .anti_alias_mode = anti_alias,
        .text_render_hint = text_hint,
        .compositing_mode = compositing,
        .compositing_quality = quality,
        .render_origin_x = origin_x,
        .render_origin_y = origin_y,
        .text_contrast = text_contrast,
        .filter_type = filter,
        .pixel_offset = pixel_offset,
        .world_to_device = world_to_device,
        .palette = palette,
    };
}

fn validateBasicVga(palette: palette_data.Palette) !void {
    for (0..palette.count) |index| {
        const color = try palette.get(@intCast(index));
        const rgb: u24 = (@as(u24, color.red) << 16) | (@as(u24, color.green) << 8) | color.blue;
        switch (rgb) {
            0x000000,
            0x000080,
            0x008000,
            0x008080,
            0x800000,
            0x800080,
            0x808000,
            0xc0c0c0,
            0x808080,
            0x0000ff,
            0x00ff00,
            0x00ffff,
            0xff0000,
            0xff00ff,
            0xffff00,
            0xffffff,
            => {},
            else => return error.InvalidEmfPlusSetTSGraphicsBasicVgaColor,
        }
    }
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .set_ts_graphics,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

fn fixedData() [36]u8 {
    var data = [_]u8{0} ** 36;
    data[0..4].* = .{ 5, 5, 1, 5 };
    std.mem.writeInt(i16, data[4..6], std.math.minInt(i16), .little);
    std.mem.writeInt(i16, data[6..8], std.math.maxInt(i16), .little);
    std.mem.writeInt(u16, data[8..10], 12, .little);
    data[10..12].* = .{ 7, 4 };
    for ([_]u32{ 0x80000000, 0x3fc00000, 0xc0100000, 0x7f800000, 0x7fc00001, 0x41100000 }, 0..) |bits, index|
        std.mem.writeInt(u32, data[12 + index * 4 ..][0..4], bits, .little);
    return data;
}

test "EMF+ SetTSGraphics parses every fixed field and preserves reserved flags" {
    const data = fixedData();
    const parsed = try parse(makeRecord(0xfffc, &data), .{});
    try std.testing.expectEqual(@as(u16, 0xfffc), parsed.flags);
    try std.testing.expect(!parsed.basic_vga and parsed.palette == null);
    try std.testing.expectEqual(smoothing_mode.SmoothingMode.anti_alias_8x8, parsed.anti_alias_mode);
    try std.testing.expectEqual(text_rendering_hint.TextRenderingHint.clear_type_grid_fit, parsed.text_render_hint);
    try std.testing.expectEqual(compositing_mode.CompositingMode.source_copy, parsed.compositing_mode);
    try std.testing.expectEqual(compositing_quality.CompositingQuality.assume_linear, parsed.compositing_quality);
    try std.testing.expectEqual(std.math.minInt(i16), parsed.render_origin_x);
    try std.testing.expectEqual(std.math.maxInt(i16), parsed.render_origin_y);
    try std.testing.expectEqual(@as(u16, 12), parsed.text_contrast);
    try std.testing.expectEqual(filter_type.FilterType.gaussian_quad, parsed.filter_type);
    try std.testing.expectEqual(pixel_offset_mode.PixelOffsetMode.half, parsed.pixel_offset);
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(parsed.world_to_device.m11)));
    try std.testing.expect(std.math.isPositiveInf(parsed.world_to_device.m22));
    try std.testing.expect(std.math.isNan(parsed.world_to_device.dx));
    try std.testing.expectEqual(@as(f32, 9), parsed.world_to_device.dy);
}

test "EMF+ SetTSGraphics parses optional palette and validates VGA claim" {
    const fixed = fixedData();
    var bytes = [_]u8{0} ** 52;
    @memcpy(bytes[0..36], &fixed);
    std.mem.writeInt(u32, bytes[36..40], 0, .little);
    std.mem.writeInt(u32, bytes[40..44], 2, .little);
    bytes[44..48].* = .{ 0x80, 0x00, 0x00, 0x11 };
    bytes[48..52].* = .{ 0xff, 0xff, 0xff, 0xff };
    const parsed = try parse(makeRecord(0x0003, &bytes), .{});
    try std.testing.expect(parsed.basic_vga);
    try std.testing.expectEqual(@as(u32, 2), parsed.palette.?.count);
    try std.testing.expectEqual(@as(u8, 0x11), (try parsed.palette.?.get(0)).alpha);

    var non_vga = bytes;
    non_vga[44..48].* = .{ 1, 2, 3, 0xff };
    try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsBasicVgaColor, parse(makeRecord(3, &non_vga), .{}));
    const unrestricted = try parse(makeRecord(1, &non_vga), .{});
    try std.testing.expect(!unrestricted.basic_vga);
}

test "EMF+ SetTSGraphics rejects flags sizes limits and trailing palette data" {
    const data = fixedData();
    for (0..36) |cut|
        try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(makeRecord(0, data[0..cut]), .{}));
    var short_palette = [_]u8{0} ** 43;
    @memcpy(short_palette[0..36], &data);
    for (36..44) |cut|
        try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(makeRecord(1, short_palette[0..cut]), .{}));
    try std.testing.expectError(error.EmfPlusSetTSGraphicsBasicVgaWithoutPalette, parse(makeRecord(2, &data), .{}));
    var wrong_type = makeRecord(0, &data);
    wrong_type.kind = .set_ts_clip;
    try std.testing.expectError(error.NotEmfPlusSetTSGraphics, parse(wrong_type, .{}));
    var wrong_size = makeRecord(0, &data);
    wrong_size.size = 44;
    try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(0, &data);
    wrong_data_size.data_size = 32;
    try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(wrong_data_size, .{}));
    wrong_data_size.data_size = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(0, &data);
    wrong_slice.data = data[0..35];
    try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(wrong_slice, .{}));

    var palette = [_]u8{0} ** 44;
    @memcpy(palette[0..36], &data);
    palette[40] = 1;
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(1, &palette), .{ .max_palette_entries = 0 }));
    var trailing = [_]u8{0} ** 48;
    @memcpy(trailing[0..44], &palette);
    trailing[40] = 0;
    try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(makeRecord(1, &trailing), .{}));
    try std.testing.expectError(error.InvalidEmfPlusSetTSGraphicsSize, parse(makeRecord(0, &trailing), .{}));
}

test "EMF+ SetTSGraphics rejects every constrained scalar independently" {
    const cases = [_]struct { index: usize, value: u8, expected: anyerror }{
        .{ .index = 0, .value = 6, .expected = error.InvalidEmfPlusSmoothingMode },
        .{ .index = 0, .value = 0xff, .expected = error.InvalidEmfPlusSmoothingMode },
        .{ .index = 1, .value = 6, .expected = error.InvalidEmfPlusTextRenderingHint },
        .{ .index = 2, .value = 2, .expected = error.InvalidEmfPlusCompositingMode },
        .{ .index = 3, .value = 0, .expected = error.InvalidEmfPlusCompositingQuality },
        .{ .index = 3, .value = 6, .expected = error.InvalidEmfPlusCompositingQuality },
        .{ .index = 8, .value = 13, .expected = error.InvalidEmfPlusSetTSGraphicsTextContrast },
        .{ .index = 9, .value = 1, .expected = error.InvalidEmfPlusSetTSGraphicsTextContrast },
        .{ .index = 10, .value = 5, .expected = error.InvalidEmfPlusFilterType },
        .{ .index = 11, .value = 5, .expected = error.InvalidEmfPlusPixelOffsetMode },
    };
    for (cases) |case| {
        var data = fixedData();
        data[case.index] = case.value;
        try std.testing.expectError(case.expected, parse(makeRecord(0, &data), .{}));
    }
}
