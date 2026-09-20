const std = @import("std");
const binary = @import("../../binary/reader.zig");
const combine_mode = @import("emf_plus_combine_mode.zig");
const geometry = @import("emf_plus_geometry.zig");
const record = @import("emf_plus_record.zig");

pub const SetClipRect = struct {
    flags: u16,
    mode: combine_mode.CombineMode,
    rectangle: geometry.RectF,
};

pub fn parse(value: record.Record) !SetClipRect {
    if (value.kind != .set_clip_rect) return error.NotEmfPlusSetClipRect;
    if (value.size != 28 or value.data_size != 16 or value.data.len != 16)
        return error.InvalidEmfPlusSetClipRectSize;
    const mode = try combine_mode.CombineMode.parse(@truncate(value.flags >> 8));
    var reader: binary.Reader = .{ .bytes = value.data };
    const rectangle = try geometry.readRectF(&reader);
    std.debug.assert(reader.offset == value.data.len);
    return .{ .flags = value.flags, .mode = mode, .rectangle = rectangle };
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .set_clip_rect,
        .flags = flags,
        .size = 28,
        .data_size = 16,
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ SetClipRect preserves RectF bits CombineMode and reserved Flags" {
    var data = [_]u8{0} ** 16;
    const bits = [_]u32{ 0x80000000, 0x7f800000, 0x7fc00001, 0xc0900000 };
    for (bits, 0..) |item, index|
        std.mem.writeInt(u32, data[index * 4 ..][0..4], item, .little);
    for (0..6) |raw_mode| {
        const flags: u16 = 0xf0ff | (@as(u16, @intCast(raw_mode)) << 8);
        const parsed = try parse(makeRecord(flags, &data));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(@as(u4, @intCast(raw_mode)), @intFromEnum(parsed.mode));
        try std.testing.expectEqual(bits[0], @as(u32, @bitCast(parsed.rectangle.x)));
        try std.testing.expectEqual(bits[1], @as(u32, @bitCast(parsed.rectangle.y)));
        try std.testing.expectEqual(bits[2], @as(u32, @bitCast(parsed.rectangle.width)));
        try std.testing.expectEqual(bits[3], @as(u32, @bitCast(parsed.rectangle.height)));
    }
}

test "EMF+ SetClipRect rejects type mode every size axis and all truncations" {
    const data = [_]u8{0} ** 16;
    for (0..16) |cut| {
        var truncated = makeRecord(0, data[0..cut]);
        truncated.size = @intCast(record.header_size + cut);
        truncated.data_size = @intCast(cut);
        try std.testing.expectError(error.InvalidEmfPlusSetClipRectSize, parse(truncated));
    }
    var wrong_type = makeRecord(0, &data);
    wrong_type.kind = .set_clip_path;
    try std.testing.expectError(error.NotEmfPlusSetClipRect, parse(wrong_type));
    var wrong_size = makeRecord(0, &data);
    wrong_size.size = 24;
    try std.testing.expectError(error.InvalidEmfPlusSetClipRectSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0, &data);
    wrong_data_size.data_size = 12;
    try std.testing.expectError(error.InvalidEmfPlusSetClipRectSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0, &data);
    wrong_slice.data = data[0..15];
    try std.testing.expectError(error.InvalidEmfPlusSetClipRectSize, parse(wrong_slice));
    for (6..16) |raw_mode| {
        const flags: u16 = @as(u16, @intCast(raw_mode)) << 8;
        try std.testing.expectError(error.InvalidEmfPlusCombineMode, parse(makeRecord(flags, &data)));
    }
}
