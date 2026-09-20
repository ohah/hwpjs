const std = @import("std");
const record = @import("emf_plus_record.zig");

pub const min_text_contrast: u12 = 1000;
pub const max_text_contrast: u12 = 2200;

pub const SetTextContrast = struct {
    flags: u16,
    text_contrast: u12,
};

pub fn parse(value: record.Record) !SetTextContrast {
    if (value.kind != .set_text_contrast) return error.NotEmfPlusSetTextContrast;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetTextContrastSize;
    const text_contrast: u12 = @truncate(value.flags);
    if (text_contrast < min_text_contrast or text_contrast > max_text_contrast)
        return error.InvalidEmfPlusTextContrast;
    return .{ .flags = value.flags, .text_contrast = text_contrast };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_text_contrast,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetTextContrast accepts inclusive gamma range and preserves reserved bits" {
    const lower = try parse(makeRecord(0xf000 | @as(u16, min_text_contrast)));
    try std.testing.expectEqual(@as(u16, 0xf3e8), lower.flags);
    try std.testing.expectEqual(@as(u12, 1000), lower.text_contrast);
    const upper = try parse(makeRecord(0xa000 | @as(u16, max_text_contrast)));
    try std.testing.expectEqual(@as(u16, 0xa898), upper.flags);
    try std.testing.expectEqual(@as(u12, 2200), upper.text_contrast);
    try std.testing.expectEqual(@as(u12, 1500), (try parse(makeRecord(1500))).text_contrast);
}

test "EMF+ SetTextContrast rejects range type and every size axis" {
    try std.testing.expectError(error.InvalidEmfPlusTextContrast, parse(makeRecord(999)));
    try std.testing.expectError(error.InvalidEmfPlusTextContrast, parse(makeRecord(2201)));
    try std.testing.expectError(error.InvalidEmfPlusTextContrast, parse(makeRecord(0x0fff)));
    var wrong_size = makeRecord(1000);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetTextContrastSize, parse(wrong_size));
    var wrong_data_size = makeRecord(1000);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetTextContrastSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(1000);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetTextContrastSize, parse(wrong_slice));
    var wrong_type = makeRecord(1000);
    wrong_type.kind = .set_interpolation_mode;
    try std.testing.expectError(error.NotEmfPlusSetTextContrast, parse(wrong_type));
}
