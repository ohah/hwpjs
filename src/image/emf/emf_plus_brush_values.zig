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
}
