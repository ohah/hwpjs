const std = @import("std");

pub const byte_size = 40;

pub const Flags = packed struct(u32) {
    double_buffer: bool,
    stereo: bool,
    draw_to_window: bool,
    draw_to_bitmap: bool,
    support_gdi: bool,
    support_opengl: bool,
    generic_format: bool,
    need_palette: bool,
    need_system_palette: bool,
    swap_exchange: bool,
    swap_copy: bool,
    swap_layer_buffers: bool,
    generic_accelerated: bool,
    support_direct_draw: bool,
    direct3d_accelerated: bool,
    support_composition: bool,
    reserved: u13,
    depth_dont_care: bool,
    double_buffer_dont_care: bool,
    stereo_dont_care: bool,
};

pub const PixelType = enum(u8) {
    rgba = 0,
    color_index = 1,
};

pub const Descriptor = struct {
    raw: []const u8,
    size: u16,
    version: u16,
    flags: Flags,
    pixel_type: PixelType,
    color_bits: u8,
    red_bits: u8,
    red_shift: u8,
    green_bits: u8,
    green_shift: u8,
    blue_bits: u8,
    blue_shift: u8,
    alpha_bits: u8,
    alpha_shift: u8,
    accumulation_bits: u8,
    accumulation_red_bits: u8,
    accumulation_green_bits: u8,
    accumulation_blue_bits: u8,
    accumulation_alpha_bits: u8,
    depth_bits: u8,
    stencil_bits: u8,
    auxiliary_buffers: u8,
    layer_type: u8,
    reserved: u8,
    layer_mask: u32,
    visible_mask: u32,
    damage_mask: u32,
};

pub fn parse(bytes: []const u8) !Descriptor {
    if (bytes.len != byte_size) return error.InvalidEmfPixelFormatSize;
    const size = std.mem.readInt(u16, bytes[0..2], .little);
    if (size != byte_size) return error.InvalidEmfPixelFormatDescriptorSize;
    const version = std.mem.readInt(u16, bytes[2..4], .little);
    if (version != 1) return error.InvalidEmfPixelFormatVersion;
    const flags_value = std.mem.readInt(u32, bytes[4..8], .little);
    const flags: Flags = @bitCast(flags_value);
    if (flags.reserved != 0) return error.InvalidEmfPixelFormatFlags;
    if (flags.double_buffer and flags.support_gdi) return error.InvalidEmfPixelFormatFlags;
    const pixel_type: PixelType = switch (bytes[8]) {
        0 => .rgba,
        1 => .color_index,
        else => return error.InvalidEmfPixelType,
    };

    return .{
        .raw = bytes,
        .size = size,
        .version = version,
        .flags = flags,
        .pixel_type = pixel_type,
        .color_bits = bytes[9],
        .red_bits = bytes[10],
        .red_shift = bytes[11],
        .green_bits = bytes[12],
        .green_shift = bytes[13],
        .blue_bits = bytes[14],
        .blue_shift = bytes[15],
        .alpha_bits = bytes[16],
        .alpha_shift = bytes[17],
        .accumulation_bits = bytes[18],
        .accumulation_red_bits = bytes[19],
        .accumulation_green_bits = bytes[20],
        .accumulation_blue_bits = bytes[21],
        .accumulation_alpha_bits = bytes[22],
        .depth_bits = bytes[23],
        .stencil_bits = bytes[24],
        .auxiliary_buffers = bytes[25],
        .layer_type = bytes[26],
        .reserved = bytes[27],
        .layer_mask = std.mem.readInt(u32, bytes[28..32], .little),
        .visible_mask = std.mem.readInt(u32, bytes[32..36], .little),
        .damage_mask = std.mem.readInt(u32, bytes[36..40], .little),
    };
}

test "PixelFormatDescriptor parses every field and preserves ignored values" {
    var bytes = [_]u8{0} ** byte_size;
    std.mem.writeInt(u16, bytes[0..2], byte_size, .little);
    std.mem.writeInt(u16, bytes[2..4], 1, .little);
    std.mem.writeInt(u32, bytes[4..8], 0xe000802c, .little);
    bytes[8..28].* = .{ 1, 8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 0xab };
    std.mem.writeInt(u32, bytes[28..32], 0x11223344, .little);
    std.mem.writeInt(u32, bytes[32..36], 0x55667788, .little);
    std.mem.writeInt(u32, bytes[36..40], 0x99aabbcc, .little);

    const value = try parse(&bytes);
    try std.testing.expectEqual(PixelType.color_index, value.pixel_type);
    try std.testing.expectEqual(@as(u16, byte_size), value.size);
    try std.testing.expectEqual(@as(u16, 1), value.version);
    try std.testing.expect(value.flags.draw_to_window);
    try std.testing.expect(value.flags.draw_to_bitmap);
    try std.testing.expect(value.flags.support_opengl);
    try std.testing.expect(value.flags.support_composition);
    try std.testing.expect(value.flags.depth_dont_care);
    try std.testing.expect(value.flags.double_buffer_dont_care);
    try std.testing.expect(value.flags.stereo_dont_care);
    try std.testing.expectEqual(@as(u8, 8), value.color_bits);
    try std.testing.expectEqual(@as(u8, 1), value.red_bits);
    try std.testing.expectEqual(@as(u8, 2), value.red_shift);
    try std.testing.expectEqual(@as(u8, 3), value.green_bits);
    try std.testing.expectEqual(@as(u8, 4), value.green_shift);
    try std.testing.expectEqual(@as(u8, 5), value.blue_bits);
    try std.testing.expectEqual(@as(u8, 6), value.blue_shift);
    try std.testing.expectEqual(@as(u8, 7), value.alpha_bits);
    try std.testing.expectEqual(@as(u8, 8), value.alpha_shift);
    try std.testing.expectEqual(@as(u8, 9), value.accumulation_bits);
    try std.testing.expectEqual(@as(u8, 10), value.accumulation_red_bits);
    try std.testing.expectEqual(@as(u8, 11), value.accumulation_green_bits);
    try std.testing.expectEqual(@as(u8, 12), value.accumulation_blue_bits);
    try std.testing.expectEqual(@as(u8, 13), value.accumulation_alpha_bits);
    try std.testing.expectEqual(@as(u8, 14), value.depth_bits);
    try std.testing.expectEqual(@as(u8, 15), value.stencil_bits);
    try std.testing.expectEqual(@as(u8, 16), value.auxiliary_buffers);
    try std.testing.expectEqual(@as(u8, 17), value.layer_type);
    try std.testing.expectEqual(@as(u8, 0xab), value.reserved);
    try std.testing.expectEqual(@as(u32, 0x11223344), value.layer_mask);
    try std.testing.expectEqual(@as(u32, 0x55667788), value.visible_mask);
    try std.testing.expectEqual(@as(u32, 0x99aabbcc), value.damage_mask);
    try std.testing.expectEqualSlices(u8, &bytes, value.raw);
}

test "PixelFormatDescriptor rejects structural and enumerated drift" {
    var bytes = [_]u8{0} ** byte_size;
    std.mem.writeInt(u16, bytes[0..2], byte_size, .little);
    std.mem.writeInt(u16, bytes[2..4], 1, .little);

    try std.testing.expectError(error.InvalidEmfPixelFormatSize, parse(bytes[0 .. byte_size - 1]));
    const oversized = bytes ++ [_]u8{0};
    try std.testing.expectError(error.InvalidEmfPixelFormatSize, parse(&oversized));

    var invalid = bytes;
    invalid[0] = byte_size - 1;
    try std.testing.expectError(error.InvalidEmfPixelFormatDescriptorSize, parse(&invalid));
    invalid = bytes;
    invalid[2] = 2;
    try std.testing.expectError(error.InvalidEmfPixelFormatVersion, parse(&invalid));
    invalid = bytes;
    invalid[6] = 1;
    try std.testing.expectError(error.InvalidEmfPixelFormatFlags, parse(&invalid));
    invalid = bytes;
    invalid[4] = 0x11;
    try std.testing.expectError(error.InvalidEmfPixelFormatFlags, parse(&invalid));
    invalid = bytes;
    invalid[8] = 2;
    try std.testing.expectError(error.InvalidEmfPixelType, parse(&invalid));
}
