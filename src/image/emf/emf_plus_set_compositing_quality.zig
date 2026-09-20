const std = @import("std");
const compositing_quality = @import("emf_plus_compositing_quality.zig");
const record = @import("emf_plus_record.zig");

pub const SetCompositingQuality = struct {
    flags: u16,
    raw_quality: u8,
    quality: compositing_quality.WireValue,
};

pub fn parse(value: record.Record) !SetCompositingQuality {
    if (value.kind != .set_compositing_quality) return error.NotEmfPlusSetCompositingQuality;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetCompositingQualitySize;
    const raw_quality: u8 = @truncate(value.flags);
    return .{
        .flags = value.flags,
        .raw_quality = raw_quality,
        .quality = compositing_quality.WireValue.parse(raw_quality),
    };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_compositing_quality,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetCompositingQuality preserves every defined mode and ignored reserved bits" {
    for (1..6) |raw| {
        const flags: u16 = 0xff00 | @as(u16, @intCast(raw));
        const parsed = try parse(makeRecord(flags));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(@as(u8, @intCast(raw)), parsed.raw_quality);
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @intFromEnum(parsed.quality.defined));
        try std.testing.expectEqual(parsed.quality.defined, parsed.quality.effective());
    }
    try std.testing.expectEqual(compositing_quality.CompositingQuality.high_speed, (try parse(makeRecord(0x0002))).quality.defined);
}

test "EMF+ SetCompositingQuality preserves invalid wire values with Windows Default behavior" {
    for (0..256) |raw_usize| {
        const raw: u8 = @intCast(raw_usize);
        if (raw >= 1 and raw <= 5) continue;
        const parsed = try parse(makeRecord(0xab00 | @as(u16, raw)));
        try std.testing.expectEqual(raw, parsed.raw_quality);
        try std.testing.expectEqual(raw, parsed.quality.invalid_windows_default);
        try std.testing.expectEqual(compositing_quality.CompositingQuality.default, parsed.quality.effective());
    }
}

test "EMF+ SetCompositingQuality rejects type and every size axis" {
    var wrong_size = makeRecord(1);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetCompositingQualitySize, parse(wrong_size));
    var wrong_data_size = makeRecord(1);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetCompositingQualitySize, parse(wrong_data_size));
    var wrong_slice = makeRecord(1);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetCompositingQualitySize, parse(wrong_slice));
    var wrong_type = makeRecord(1);
    wrong_type.kind = .set_interpolation_mode;
    try std.testing.expectError(error.NotEmfPlusSetCompositingQuality, parse(wrong_type));
}
