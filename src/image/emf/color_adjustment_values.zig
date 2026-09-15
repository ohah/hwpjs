const std = @import("std");

pub const negative_flag: u16 = 0x0001;
pub const logarithmic_filter_flag: u16 = 0x0002;
pub const known_flags: u16 = negative_flag | logarithmic_filter_flag;

pub const Values = struct {
    raw: u16,
    negative: bool,
    logarithmic_filter: bool,
};

pub fn values(raw: u16) !Values {
    if (raw & ~known_flags != 0) return error.InvalidEmfColorAdjustmentValues;
    return .{
        .raw = raw,
        .negative = raw & negative_flag != 0,
        .logarithmic_filter = raw & logarithmic_filter_flag != 0,
    };
}

pub const Illuminant = enum(u16) {
    device_default = 0x0000,
    tungsten = 0x0001,
    b = 0x0002,
    daylight = 0x0003,
    d50 = 0x0004,
    d55 = 0x0005,
    d65 = 0x0006,
    d75 = 0x0007,
    fluorescent = 0x0008,
};

pub fn illuminant(raw: u16) !Illuminant {
    return std.enums.fromInt(Illuminant, raw) orelse error.InvalidEmfColorAdjustmentIlluminant;
}

test "ColorAdjustment flag combinations and illuminants are exact" {
    for (0..4) |raw| {
        const parsed = try values(@intCast(raw));
        try std.testing.expectEqual(@as(u16, @intCast(raw)), parsed.raw);
        try std.testing.expectEqual(raw & negative_flag != 0, parsed.negative);
        try std.testing.expectEqual(raw & logarithmic_filter_flag != 0, parsed.logarithmic_filter);
    }
    for ([_]u16{ 4, 0x8000, std.math.maxInt(u16) }) |raw|
        try std.testing.expectError(error.InvalidEmfColorAdjustmentValues, values(raw));

    for (0..9) |raw|
        try std.testing.expectEqual(@as(u16, @intCast(raw)), @intFromEnum(try illuminant(@intCast(raw))));
    for ([_]u16{ 9, std.math.maxInt(u16) }) |raw|
        try std.testing.expectError(error.InvalidEmfColorAdjustmentIlluminant, illuminant(raw));
}
