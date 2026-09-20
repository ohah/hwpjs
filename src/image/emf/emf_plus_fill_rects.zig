const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush_id = @import("emf_plus_brush_id.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_array = @import("emf_plus_rect_array.zig");

pub const Options = rect_array.Options;

pub const FillRects = struct {
    flags: u16,
    brush: brush_id.BrushIdOrColor,
    compressed: bool,
    count: u32,
    rect_array: rect_array.RectArray,
};

pub fn parse(value: record.Record, options: Options) !FillRects {
    if (value.kind != .fill_rects) return error.NotEmfPlusFillRects;
    if (value.size < 20 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusFillRectsSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const raw_brush = try reader.readInt(u32);
    const count = try reader.readInt(u32);
    const compressed = record_flags.isCompressed(value.flags);
    const rectangles = rect_array.parse(value.data[reader.offset..], count, compressed, options) catch |err| switch (err) {
        error.InvalidEmfPlusRectArraySize => return error.InvalidEmfPlusFillRectsSize,
        error.InvalidEmfPlusRectArrayCount => return error.InvalidEmfPlusFillRectsCount,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .brush = try brush_id.parse(raw_brush, value.flags),
        .compressed = compressed,
        .count = count,
        .rect_array = rectangles,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .fill_rects,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ FillRects parses compressed rectangles and Brush object ID" {
    var data = [_]u8{0} ** 24;
    std.mem.writeInt(u32, data[0..4], 63, .little);
    std.mem.writeInt(u32, data[4..8], 2, .little);
    for ([_]i16{ -32768, -1, 0, 32767, 1, 2, 3, 4 }, 0..) |value, index|
        std.mem.writeInt(i16, data[8 + index * 2 ..][0..2], value, .little);
    const parsed = try parse(makeRecord(&data, 0x7f00), .{});
    try std.testing.expectEqual(@as(u16, 0x7f00), parsed.flags);
    try std.testing.expectEqual(@as(u6, 63), parsed.brush.brush_id);
    try std.testing.expect(parsed.compressed);
    try std.testing.expectEqual(@as(u32, 2), parsed.count);
    var rectangles = parsed.rect_array.rectangles();
    try std.testing.expectEqual(@as(i16, -32768), (try rectangles.next()).?.compressed.x);
    try std.testing.expectEqual(@as(i16, 4), (try rectangles.next()).?.compressed.height);
    try std.testing.expect((try rectangles.next()) == null);
}

test "EMF+ FillRects preserves literal ARGB and floating rectangle bits" {
    var data = [_]u8{0} ** 24;
    std.mem.writeInt(u32, data[0..4], 0x44332211, .little);
    std.mem.writeInt(u32, data[4..8], 1, .little);
    for ([_]u32{ 0x80000000, 0x7fc00001, 0x7f800000, 0xc0900000 }, 0..) |bits, index|
        std.mem.writeInt(u32, data[8 + index * 4 ..][0..4], bits, .little);
    const parsed = try parse(makeRecord(&data, 0xbfff), .{});
    try std.testing.expectEqual(@as(u32, 0x44332211), parsed.brush.color.raw());
    try std.testing.expect(!parsed.compressed);
    var rectangles = parsed.rect_array.rectangles();
    const rectangle = (try rectangles.next()).?.float;
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(rectangle.x)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(rectangle.y)));
    try std.testing.expectEqual(@as(u32, 0x7f800000), @as(u32, @bitCast(rectangle.width)));
}

test "EMF+ FillRects rejects type brush count size axes truncation and limit" {
    var data = [_]u8{0} ** 40;
    std.mem.writeInt(u32, data[0..4], 0, .little);
    std.mem.writeInt(u32, data[4..8], 2, .little);
    _ = try parse(makeRecord(data[0..24], 0x4000), .{});
    _ = try parse(makeRecord(&data, 0), .{});
    for (0..data.len + 1) |cut| {
        if (cut != 24)
            try std.testing.expectError(error.InvalidEmfPlusFillRectsSize, parse(makeRecord(data[0..cut], 0x4000), .{}));
        if (cut != 40)
            try std.testing.expectError(error.InvalidEmfPlusFillRectsSize, parse(makeRecord(data[0..cut], 0), .{}));
    }
    var zero_count = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfPlusFillRectsCount, parse(makeRecord(&zero_count, 0x4000), .{}));
    std.mem.writeInt(u32, data[0..4], 64, .little);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(data[0..24], 0x4000), .{}));
    std.mem.writeInt(u32, data[0..4], 0, .little);
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(data[0..24], 0x4000), .{ .max_rectangles = 1 }));
    var wrong_type = makeRecord(data[0..24], 0x4000);
    wrong_type.kind = .draw_rects;
    try std.testing.expectError(error.NotEmfPlusFillRects, parse(wrong_type, .{}));
    var wrong_size = makeRecord(data[0..24], 0x4000);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillRectsSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(data[0..24], 0x4000);
    wrong_data_size.data_size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillRectsSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..24], 0x4000);
    wrong_slice.size = 28;
    wrong_slice.data_size = 16;
    try std.testing.expectError(error.InvalidEmfPlusFillRectsSize, parse(wrong_slice, .{}));
}
