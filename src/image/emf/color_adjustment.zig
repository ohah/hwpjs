const std = @import("std");
const adjustment_values = @import("color_adjustment_values.zig");

pub const size = 24;

pub const ColorAdjustment = struct {
    declared_size: u16,
    values: adjustment_values.Values,
    illuminant: adjustment_values.Illuminant,
    red_gamma: u16,
    green_gamma: u16,
    blue_gamma: u16,
    reference_black: u16,
    reference_white: u16,
    contrast: i16,
    brightness: i16,
    colorfulness: i16,
    red_green_tint: i16,
};

pub fn parse(bytes: []const u8) !ColorAdjustment {
    if (bytes.len != size) return error.InvalidEmfColorAdjustmentSize;
    const declared_size = std.mem.readInt(u16, bytes[0..2], .little);
    if (declared_size != size) return error.InvalidEmfColorAdjustmentSize;
    return .{
        .declared_size = declared_size,
        .values = try adjustment_values.values(std.mem.readInt(u16, bytes[2..4], .little)),
        .illuminant = try adjustment_values.illuminant(std.mem.readInt(u16, bytes[4..6], .little)),
        .red_gamma = std.mem.readInt(u16, bytes[6..8], .little),
        .green_gamma = std.mem.readInt(u16, bytes[8..10], .little),
        .blue_gamma = std.mem.readInt(u16, bytes[10..12], .little),
        .reference_black = std.mem.readInt(u16, bytes[12..14], .little),
        .reference_white = std.mem.readInt(u16, bytes[14..16], .little),
        .contrast = std.mem.readInt(i16, bytes[16..18], .little),
        .brightness = std.mem.readInt(i16, bytes[18..20], .little),
        .colorfulness = std.mem.readInt(i16, bytes[20..22], .little),
        .red_green_tint = std.mem.readInt(i16, bytes[22..24], .little),
    };
}

test "ColorAdjustment preserves all numeric fields including advisory-range exceptions" {
    var bytes = [_]u8{0} ** size;
    std.mem.writeInt(u16, bytes[0..2], size, .little);
    std.mem.writeInt(u16, bytes[2..4], 3, .little);
    std.mem.writeInt(u16, bytes[4..6], 8, .little);
    std.mem.writeInt(u16, bytes[6..8], 0, .little);
    std.mem.writeInt(u16, bytes[8..10], std.math.maxInt(u16), .little);
    std.mem.writeInt(u16, bytes[10..12], 10_000, .little);
    std.mem.writeInt(u16, bytes[12..14], 4_001, .little);
    std.mem.writeInt(u16, bytes[14..16], 5_999, .little);
    std.mem.writeInt(i16, bytes[16..18], std.math.minInt(i16), .little);
    std.mem.writeInt(i16, bytes[18..20], std.math.maxInt(i16), .little);
    std.mem.writeInt(i16, bytes[20..22], -101, .little);
    std.mem.writeInt(i16, bytes[22..24], 101, .little);

    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(u16, size), value.declared_size);
    try std.testing.expect(value.values.negative);
    try std.testing.expect(value.values.logarithmic_filter);
    try std.testing.expectEqual(adjustment_values.Illuminant.fluorescent, value.illuminant);
    try std.testing.expectEqual(@as(u16, 0), value.red_gamma);
    try std.testing.expectEqual(std.math.maxInt(u16), value.green_gamma);
    try std.testing.expectEqual(@as(u16, 10_000), value.blue_gamma);
    try std.testing.expectEqual(@as(u16, 4_001), value.reference_black);
    try std.testing.expectEqual(@as(u16, 5_999), value.reference_white);
    try std.testing.expectEqual(std.math.minInt(i16), value.contrast);
    try std.testing.expectEqual(std.math.maxInt(i16), value.brightness);
    try std.testing.expectEqual(@as(i16, -101), value.colorfulness);
    try std.testing.expectEqual(@as(i16, 101), value.red_green_tint);
}

test "ColorAdjustment rejects every wrong object extent size flags and illuminant" {
    var bytes = [_]u8{0} ** size;
    std.mem.writeInt(u16, bytes[0..2], size, .little);
    for (0..size) |cut|
        try std.testing.expectError(error.InvalidEmfColorAdjustmentSize, parse(bytes[0..cut]));

    var bad_size = bytes;
    std.mem.writeInt(u16, bad_size[0..2], size - 1, .little);
    try std.testing.expectError(error.InvalidEmfColorAdjustmentSize, parse(&bad_size));
    var bad_flags = bytes;
    std.mem.writeInt(u16, bad_flags[2..4], 4, .little);
    try std.testing.expectError(error.InvalidEmfColorAdjustmentValues, parse(&bad_flags));
    var bad_illuminant = bytes;
    std.mem.writeInt(u16, bad_illuminant[4..6], 9, .little);
    try std.testing.expectError(error.InvalidEmfColorAdjustmentIlluminant, parse(&bad_illuminant));
}
