const std = @import("std");
const compositing_mode = @import("emf_plus_compositing_mode.zig");
const record = @import("emf_plus_record.zig");

pub const SetCompositingMode = struct {
    flags: u16,
    mode: compositing_mode.CompositingMode,
};

pub fn parse(value: record.Record) !SetCompositingMode {
    if (value.kind != .set_compositing_mode) return error.NotEmfPlusSetCompositingMode;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetCompositingModeSize;
    return .{
        .flags = value.flags,
        .mode = try compositing_mode.CompositingMode.parse(@truncate(value.flags)),
    };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_compositing_mode,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetCompositingMode parses every mode and preserves ignored reserved bits" {
    for (0..2) |raw| {
        const flags: u16 = 0xff00 | @as(u16, @intCast(raw));
        const parsed = try parse(makeRecord(flags));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @intFromEnum(parsed.mode));
    }
}

test "EMF+ SetCompositingMode rejects enum type and every size axis" {
    try std.testing.expectError(error.InvalidEmfPlusCompositingMode, parse(makeRecord(2)));
    try std.testing.expectError(error.InvalidEmfPlusCompositingMode, parse(makeRecord(0x00ff)));
    var wrong_size = makeRecord(0);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetCompositingModeSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetCompositingModeSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetCompositingModeSize, parse(wrong_slice));
    var wrong_type = makeRecord(0);
    wrong_type.kind = .set_compositing_quality;
    try std.testing.expectError(error.NotEmfPlusSetCompositingMode, parse(wrong_type));
}
