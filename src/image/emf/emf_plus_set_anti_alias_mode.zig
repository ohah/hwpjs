const std = @import("std");
const record = @import("emf_plus_record.zig");
const smoothing_mode = @import("emf_plus_smoothing_mode.zig");

pub const SetAntiAliasMode = struct {
    flags: u16,
    smoothing: smoothing_mode.SmoothingMode,
    anti_alias: bool,
};

pub fn parse(value: record.Record) !SetAntiAliasMode {
    if (value.kind != .set_anti_alias_mode) return error.NotEmfPlusSetAntiAliasMode;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetAntiAliasModeSize;
    const raw_smoothing: u7 = @truncate(value.flags >> 1);
    return .{
        .flags = value.flags,
        .smoothing = try smoothing_mode.SmoothingMode.parse(raw_smoothing),
        .anti_alias = value.flags & 1 != 0,
    };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_anti_alias_mode,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetAntiAliasMode parses every smoothing mode A bit and ignored reserved bits" {
    for (0..6) |raw| {
        for ([_]bool{ false, true }) |anti_alias| {
            const flags: u16 = 0xff00 | @as(u16, @intCast(raw << 1)) | @intFromBool(anti_alias);
            const parsed = try parse(makeRecord(flags));
            try std.testing.expectEqual(flags, parsed.flags);
            try std.testing.expectEqual(@as(u7, @intCast(raw)), @intFromEnum(parsed.smoothing));
            try std.testing.expectEqual(anti_alias, parsed.anti_alias);
        }
    }
}

test "EMF+ SetAntiAliasMode rejects enum type and every size axis" {
    try std.testing.expectError(error.InvalidEmfPlusSmoothingMode, parse(makeRecord(6 << 1)));
    try std.testing.expectError(error.InvalidEmfPlusSmoothingMode, parse(makeRecord(127 << 1)));
    var wrong_size = makeRecord(0);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetAntiAliasModeSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetAntiAliasModeSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetAntiAliasModeSize, parse(wrong_slice));
    var wrong_type = makeRecord(0);
    wrong_type.kind = .set_text_rendering_hint;
    try std.testing.expectError(error.NotEmfPlusSetAntiAliasMode, parse(wrong_type));
}
