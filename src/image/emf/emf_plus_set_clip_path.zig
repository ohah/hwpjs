const std = @import("std");
const combine_mode = @import("emf_plus_combine_mode.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const SetClipPath = struct {
    flags: u16,
    mode: combine_mode.CombineMode,
    path_id: u6,
};

pub fn parse(value: record.Record) !SetClipPath {
    if (value.kind != .set_clip_path) return error.NotEmfPlusSetClipPath;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetClipPathSize;
    return .{
        .flags = value.flags,
        .mode = try combine_mode.CombineMode.parse(@truncate(value.flags >> 8)),
        .path_id = try record_flags.objectId(value.flags),
    };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_clip_path,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetClipPath preserves flags and parses every CombineMode with boundary ObjectID" {
    for (0..6) |raw_mode| {
        const flags: u16 = 0xf03f | (@as(u16, @intCast(raw_mode)) << 8);
        const parsed = try parse(makeRecord(flags));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(@as(u4, @intCast(raw_mode)), @intFromEnum(parsed.mode));
        try std.testing.expectEqual(@as(u6, 63), parsed.path_id);
    }
    try std.testing.expectEqual(@as(u6, 0), (try parse(makeRecord(0))).path_id);
}

test "EMF+ SetClipPath rejects type size invalid ObjectID and undefined CombineMode" {
    var wrong_type = makeRecord(0);
    wrong_type.kind = .set_clip_region;
    try std.testing.expectError(error.NotEmfPlusSetClipPath, parse(wrong_type));
    var wrong_size = makeRecord(0);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetClipPathSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetClipPathSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetClipPathSize, parse(wrong_slice));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(0x0040)));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(0x00ff)));
    for (6..16) |raw_mode| {
        const flags: u16 = @as(u16, @intCast(raw_mode)) << 8;
        try std.testing.expectError(error.InvalidEmfPlusCombineMode, parse(makeRecord(flags)));
    }
}
