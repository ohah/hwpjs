const std = @import("std");
const pixel_offset_mode = @import("emf_plus_pixel_offset_mode.zig");
const record = @import("emf_plus_record.zig");

pub const SetPixelOffsetMode = struct {
    flags: u16,
    mode: pixel_offset_mode.PixelOffsetMode,
};

pub fn parse(value: record.Record) !SetPixelOffsetMode {
    if (value.kind != .set_pixel_offset_mode) return error.NotEmfPlusSetPixelOffsetMode;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetPixelOffsetModeSize;
    return .{
        .flags = value.flags,
        .mode = try pixel_offset_mode.PixelOffsetMode.parse(@truncate(value.flags)),
    };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_pixel_offset_mode,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetPixelOffsetMode parses every mode and preserves ignored reserved bits" {
    for (0..5) |raw| {
        const flags: u16 = 0xff00 | @as(u16, @intCast(raw));
        const parsed = try parse(makeRecord(flags));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @intFromEnum(parsed.mode));
    }
    try std.testing.expectEqual(pixel_offset_mode.PixelOffsetMode.none, (try parse(makeRecord(0x0003))).mode);
}

test "EMF+ SetPixelOffsetMode rejects enum type and every size axis" {
    try std.testing.expectError(error.InvalidEmfPlusPixelOffsetMode, parse(makeRecord(5)));
    try std.testing.expectError(error.InvalidEmfPlusPixelOffsetMode, parse(makeRecord(0x00ff)));
    var wrong_size = makeRecord(0);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetPixelOffsetModeSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetPixelOffsetModeSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetPixelOffsetModeSize, parse(wrong_slice));
    var wrong_type = makeRecord(0);
    wrong_type.kind = .set_compositing_mode;
    try std.testing.expectError(error.NotEmfPlusSetPixelOffsetMode, parse(wrong_type));
}
