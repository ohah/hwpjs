const std = @import("std");
const interpolation_mode = @import("emf_plus_interpolation_mode.zig");
const record = @import("emf_plus_record.zig");

pub const SetInterpolationMode = struct {
    flags: u16,
    mode: interpolation_mode.InterpolationMode,
};

pub fn parse(value: record.Record) !SetInterpolationMode {
    if (value.kind != .set_interpolation_mode) return error.NotEmfPlusSetInterpolationMode;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetInterpolationModeSize;
    return .{
        .flags = value.flags,
        .mode = try interpolation_mode.InterpolationMode.parse(@truncate(value.flags)),
    };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_interpolation_mode,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetInterpolationMode parses every mode and preserves ignored reserved bits" {
    for (0..8) |raw| {
        const flags: u16 = 0xff00 | @as(u16, @intCast(raw));
        const parsed = try parse(makeRecord(flags));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @intFromEnum(parsed.mode));
    }
    try std.testing.expectEqual(interpolation_mode.InterpolationMode.high_quality_bicubic, (try parse(makeRecord(0x0007))).mode);
}

test "EMF+ SetInterpolationMode rejects enum type and every size axis" {
    try std.testing.expectError(error.InvalidEmfPlusInterpolationMode, parse(makeRecord(8)));
    try std.testing.expectError(error.InvalidEmfPlusInterpolationMode, parse(makeRecord(0x00ff)));
    var wrong_size = makeRecord(0);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetInterpolationModeSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetInterpolationModeSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetInterpolationModeSize, parse(wrong_slice));
    var wrong_type = makeRecord(0);
    wrong_type.kind = .set_pixel_offset_mode;
    try std.testing.expectError(error.NotEmfPlusSetInterpolationMode, parse(wrong_type));
}
