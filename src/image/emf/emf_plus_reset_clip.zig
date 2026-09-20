const std = @import("std");
const record = @import("emf_plus_record.zig");

pub const ResetClip = struct { flags: u16 };

pub fn parse(value: record.Record) !ResetClip {
    if (value.kind != .reset_clip) return error.NotEmfPlusResetClip;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusResetClipSize;
    return .{ .flags = value.flags };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .reset_clip,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ ResetClip preserves every ignored Flags bit" {
    for ([_]u16{ 0, 1, 0x2000, 0x8000, std.math.maxInt(u16) }) |flags|
        try std.testing.expectEqual(flags, (try parse(makeRecord(flags))).flags);
}

test "EMF+ ResetClip rejects type and every size axis" {
    var wrong_type = makeRecord(0);
    wrong_type.kind = .set_clip_rect;
    try std.testing.expectError(error.NotEmfPlusResetClip, parse(wrong_type));
    var wrong_size = makeRecord(0);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusResetClipSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusResetClipSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0);
    wrong_slice.data = &.{ 0, 0, 0, 0 };
    try std.testing.expectError(error.InvalidEmfPlusResetClipSize, parse(wrong_slice));
}
