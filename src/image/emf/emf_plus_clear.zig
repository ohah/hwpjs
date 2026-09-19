const std = @import("std");
const binary = @import("../../binary/reader.zig");
const argb = @import("emf_plus_argb.zig");
const record = @import("emf_plus_record.zig");

pub const Clear = struct {
    flags: u16,
    color: argb.Argb,
};

pub fn parse(value: record.Record) !Clear {
    if (value.kind != .clear) return error.NotEmfPlusClear;
    if (value.size != 16 or value.data_size != 4 or value.data.len != 4)
        return error.InvalidEmfPlusClearSize;
    var reader: binary.Reader = .{ .bytes = value.data };
    return .{
        .flags = value.flags,
        .color = try argb.read(&reader),
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .clear,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ Clear preserves ignored flags and parses ARGB wire channels" {
    const bytes = [_]u8{ 0x11, 0x22, 0x33, 0x44 };
    const value = try parse(makeRecord(&bytes, 0xffff));
    try std.testing.expectEqual(@as(u16, 0xffff), value.flags);
    try std.testing.expectEqual(@as(u8, 0x11), value.color.blue);
    try std.testing.expectEqual(@as(u8, 0x22), value.color.green);
    try std.testing.expectEqual(@as(u8, 0x33), value.color.red);
    try std.testing.expectEqual(@as(u8, 0x44), value.color.alpha);
    try std.testing.expectEqual(@as(u32, 0x4433_2211), value.color.raw());
}

test "EMF+ Clear rejects every size mismatch and wrong record type" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5 };
    for (0..4) |cut|
        try std.testing.expectError(error.InvalidEmfPlusClearSize, parse(makeRecord(bytes[0..cut], 0)));
    try std.testing.expectError(error.InvalidEmfPlusClearSize, parse(makeRecord(&bytes, 0)));
    var wrong_data_size = makeRecord(bytes[0..4], 0);
    wrong_data_size.data_size = 0;
    try std.testing.expectError(error.InvalidEmfPlusClearSize, parse(wrong_data_size));
    var wrong_size = makeRecord(bytes[0..4], 0);
    wrong_size.size = 12;
    try std.testing.expectError(error.InvalidEmfPlusClearSize, parse(wrong_size));
    var short_slice = makeRecord(bytes[0..3], 0);
    short_slice.size = 16;
    short_slice.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusClearSize, parse(short_slice));
    var long_slice = makeRecord(&bytes, 0);
    long_slice.size = 16;
    long_slice.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusClearSize, parse(long_slice));
    var wrong_type = makeRecord(bytes[0..4], 0);
    wrong_type.kind = .fill_rects;
    try std.testing.expectError(error.NotEmfPlusClear, parse(wrong_type));
}
