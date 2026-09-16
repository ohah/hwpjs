pub const BrushType = enum(u32) {
    solid_color = 0,
    hatch_fill = 1,
    texture_fill = 2,
    path_gradient = 3,
    linear_gradient = 4,
};

pub fn brushType(raw: u32) !BrushType {
    if (raw > @intFromEnum(BrushType.linear_gradient)) return error.InvalidEmfPlusBrushType;
    return @enumFromInt(raw);
}

pub const WrapMode = enum(u32) {
    tile = 0,
    tile_flip_x = 1,
    tile_flip_y = 2,
    tile_flip_xy = 3,
    clamp = 4,
};

pub fn wrapMode(raw: u32) !WrapMode {
    if (raw > @intFromEnum(WrapMode.clamp)) return error.InvalidEmfPlusWrapMode;
    return @enumFromInt(raw);
}

pub const HatchStyle = enum(u6) {
    horizontal = 0x00,
    vertical = 0x01,
    forward_diagonal = 0x02,
    backward_diagonal = 0x03,
    large_grid = 0x04,
    diagonal_cross = 0x05,
    percent_05 = 0x06,
    percent_10 = 0x07,
    percent_20 = 0x08,
    percent_25 = 0x09,
    percent_30 = 0x0a,
    percent_40 = 0x0b,
    percent_50 = 0x0c,
    percent_60 = 0x0d,
    percent_70 = 0x0e,
    percent_75 = 0x0f,
    percent_80 = 0x10,
    percent_90 = 0x11,
    light_downward_diagonal = 0x12,
    light_upward_diagonal = 0x13,
    dark_downward_diagonal = 0x14,
    dark_upward_diagonal = 0x15,
    wide_downward_diagonal = 0x16,
    wide_upward_diagonal = 0x17,
    light_vertical = 0x18,
    light_horizontal = 0x19,
    narrow_vertical = 0x1a,
    narrow_horizontal = 0x1b,
    dark_vertical = 0x1c,
    dark_horizontal = 0x1d,
    dashed_downward_diagonal = 0x1e,
    dashed_upward_diagonal = 0x1f,
    dashed_horizontal = 0x20,
    dashed_vertical = 0x21,
    small_confetti = 0x22,
    large_confetti = 0x23,
    zig_zag = 0x24,
    wave = 0x25,
    diagonal_brick = 0x26,
    horizontal_brick = 0x27,
    weave = 0x28,
    plaid = 0x29,
    divot = 0x2a,
    dotted_grid = 0x2b,
    dotted_diamond = 0x2c,
    shingle = 0x2d,
    trellis = 0x2e,
    sphere = 0x2f,
    small_grid = 0x30,
    small_checker_board = 0x31,
    large_checker_board = 0x32,
    outlined_diamond = 0x33,
    solid_diamond = 0x34,
};

pub fn hatchStyle(raw: u32) !HatchStyle {
    if (raw > @intFromEnum(HatchStyle.solid_diamond)) return error.InvalidEmfPlusHatchStyle;
    return @enumFromInt(@as(u6, @intCast(raw)));
}

pub const BrushDataFlags = packed struct(u32) {
    path: bool,
    transform: bool,
    preset_colors: bool,
    blend_factors_h: bool,
    blend_factors_v: bool,
    reserved_5: bool,
    focus_scales: bool,
    gamma_corrected: bool,
    do_not_transform: bool,
    reserved: u23,

    pub fn fromRaw(raw_value: u32) BrushDataFlags {
        return @bitCast(raw_value);
    }

    pub fn raw(self: BrushDataFlags) u32 {
        return @bitCast(self);
    }
};

pub const defined_brush_data_flags: u32 = 0x0000_01df;

pub fn validateBrushDataFlags(raw: u32) !void {
    if (raw & ~defined_brush_data_flags != 0) return error.InvalidEmfPlusBrushDataFlags;
}

test "EMF+ brush and wrap enums reject gaps beyond their official domains" {
    const std = @import("std");
    for (0..5) |raw| {
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try brushType(@intCast(raw))));
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try wrapMode(@intCast(raw))));
    }
    try std.testing.expectError(error.InvalidEmfPlusBrushType, brushType(5));
    try std.testing.expectError(error.InvalidEmfPlusBrushType, brushType(0xffffffff));
    try std.testing.expectError(error.InvalidEmfPlusWrapMode, wrapMode(5));
    try std.testing.expectError(error.InvalidEmfPlusWrapMode, wrapMode(0xffffffff));
    for (0..0x35) |raw|
        try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try hatchStyle(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusHatchStyle, hatchStyle(0x35));
    try std.testing.expectError(error.InvalidEmfPlusHatchStyle, hatchStyle(0xffffffff));
}

test "EMF+ brush data flags expose known bits and preserve every unknown bit" {
    const std = @import("std");
    try std.testing.expect(BrushDataFlags.fromRaw(0x0001).path);
    try std.testing.expect(BrushDataFlags.fromRaw(0x0002).transform);
    try std.testing.expect(BrushDataFlags.fromRaw(0x0004).preset_colors);
    try std.testing.expect(BrushDataFlags.fromRaw(0x0008).blend_factors_h);
    try std.testing.expect(BrushDataFlags.fromRaw(0x0010).blend_factors_v);
    try std.testing.expect(BrushDataFlags.fromRaw(0x0040).focus_scales);
    try std.testing.expect(BrushDataFlags.fromRaw(0x0080).gamma_corrected);
    try std.testing.expect(BrushDataFlags.fromRaw(0x0100).do_not_transform);
    const reserved = BrushDataFlags.fromRaw(0x8000_0020);
    try std.testing.expect(reserved.reserved_5);
    try std.testing.expectEqual(@as(u23, 0x400000), reserved.reserved);
    try std.testing.expectEqual(@as(u32, 0x8000_0020), reserved.raw());

    const flags = BrushDataFlags.fromRaw(0xffff_ffff);
    try std.testing.expect(flags.path);
    try std.testing.expect(flags.transform);
    try std.testing.expect(flags.preset_colors);
    try std.testing.expect(flags.blend_factors_h);
    try std.testing.expect(flags.blend_factors_v);
    try std.testing.expect(flags.focus_scales);
    try std.testing.expect(flags.gamma_corrected);
    try std.testing.expect(flags.do_not_transform);
    try std.testing.expectEqual(@as(u32, 0xffff_ffff), flags.raw());

    try validateBrushDataFlags(defined_brush_data_flags);
    try std.testing.expectError(error.InvalidEmfPlusBrushDataFlags, validateBrushDataFlags(0x20));
    try std.testing.expectError(error.InvalidEmfPlusBrushDataFlags, validateBrushDataFlags(0x200));
}
