const std = @import("std");
const record = @import("emf_plus_record.zig");
const clip_rects = @import("emf_plus_ts_clip_rects.zig");

pub const SetTSClip = struct {
    flags: u16,
    compressed: bool,
    num_rects: u16,
    rects: clip_rects.Rects,
};

pub fn parse(value: record.Record) !SetTSClip {
    if (value.kind != .set_ts_clip) return error.NotEmfPlusSetTSClip;
    const compressed = value.flags & 0x8000 != 0;
    const num_rects = value.flags & 0x7fff;
    const rect_width: u32 = if (compressed) 4 else 8;
    const expected_data_size = @as(u32, num_rects) * rect_width;
    if (value.data_size != expected_data_size or value.size != expected_data_size + record.header_size or value.data.len != expected_data_size)
        return error.InvalidEmfPlusSetTSClipSize;
    return .{
        .flags = value.flags,
        .compressed = compressed,
        .num_rects = num_rects,
        .rects = try clip_rects.parse(value.data, num_rects, compressed),
    };
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .set_ts_clip,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ SetTSClip extracts C and NumRects and preserves decoded rectangles" {
    const compressed = [_]u8{ 0x81, 0x82, 0x83, 0x84 };
    const parsed = try parse(makeRecord(0x8001, &compressed));
    try std.testing.expect(parsed.compressed);
    try std.testing.expectEqual(@as(u16, 1), parsed.num_rects);
    try std.testing.expectEqual(@as(u16, 0x8001), parsed.flags);
    var iterator = parsed.rects.iterator();
    try std.testing.expectEqual(clip_rects.Rect{ .left = 1, .top = 2, .right = 3, .bottom = 6 }, (try iterator.next()).?);

    const wide = [_]u8{0} ** 8;
    const wide_parsed = try parse(makeRecord(1, &wide));
    try std.testing.expect(!wide_parsed.compressed);
    try std.testing.expectEqual(@as(u16, 1), wide_parsed.num_rects);
    var wide_iterator = wide_parsed.rects.iterator();
    try std.testing.expectEqual(clip_rects.Rect{ .left = 0, .top = 0, .right = 0, .bottom = 0 }, (try wide_iterator.next()).?);
    _ = try parse(makeRecord(0, &.{}));
    _ = try parse(makeRecord(0x8000, &.{}));
}

test "EMF+ SetTSClip rejects type every size axis and malformed coordinates" {
    const data = [_]u8{ 0x80, 0x80, 0x80, 0x80 };
    const valid = makeRecord(0x8001, &data);
    var wrong_type = valid;
    wrong_type.kind = .set_ts_graphics;
    try std.testing.expectError(error.NotEmfPlusSetTSClip, parse(wrong_type));
    var wrong_size = valid;
    wrong_size.size = 12;
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipSize, parse(wrong_size));
    var wrong_data_size = valid;
    wrong_data_size.data_size = 0;
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipSize, parse(wrong_data_size));
    var wrong_slice = valid;
    wrong_slice.data = data[0..3];
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipSize, parse(wrong_slice));
    var wrong_count = valid;
    wrong_count.flags = 0x8002;
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipSize, parse(wrong_count));
    var malformed = data;
    malformed[2] = 0;
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipCoordinate, parse(makeRecord(0x8001, &malformed)));
}

test "EMF+ SetTSClip preserves the full 15-bit NumRects domain" {
    const compressed_count = std.math.maxInt(u15);
    const compressed = try std.testing.allocator.alloc(u8, @as(usize, compressed_count) * 4);
    defer std.testing.allocator.free(compressed);
    @memset(compressed, 0x80);
    const maximum = try parse(makeRecord(0xffff, compressed));
    try std.testing.expect(maximum.compressed);
    try std.testing.expectEqual(@as(u16, compressed_count), maximum.num_rects);

    const wide_count: u16 = 0x4001;
    const wide = try std.testing.allocator.alloc(u8, @as(usize, wide_count) * 8);
    defer std.testing.allocator.free(wide);
    @memset(wide, 0);
    const high_count = try parse(makeRecord(wide_count, wide));
    try std.testing.expect(!high_count.compressed);
    try std.testing.expectEqual(wide_count, high_count.num_rects);
}
