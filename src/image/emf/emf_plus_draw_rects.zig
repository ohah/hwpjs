const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_array = @import("emf_plus_rect_array.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const Options = rect_array.Options;

pub const DrawRects = struct {
    flags: u16,
    pen_id: u6,
    compressed: bool,
    count: u32,
    rect_array: rect_array.RectArray,

    pub fn deviceRectangles(self: DrawRects, mapping: world_page_device.Mapper) rect_device_corners.Iterator {
        return rect_device_corners.fromRectArray(self.rect_array, mapping);
    }
};

pub fn parse(value: record.Record, options: Options) !DrawRects {
    if (value.kind != .draw_rects) return error.NotEmfPlusDrawRects;
    if (value.size < 16 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusDrawRectsSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const count = try reader.readInt(u32);
    const compressed = record_flags.isCompressed(value.flags);
    const rectangles = rect_array.parse(value.data[reader.offset..], count, compressed, options) catch |err| switch (err) {
        error.InvalidEmfPlusRectArraySize => return error.InvalidEmfPlusDrawRectsSize,
        error.InvalidEmfPlusRectArrayCount => return error.InvalidEmfPlusDrawRectsCount,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .pen_id = try record_flags.objectId(value.flags),
        .compressed = compressed,
        .count = count,
        .rect_array = rectangles,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_rects,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ DrawRects parses compressed rectangles Pen ID and ignored flags" {
    var data = [_]u8{0} ** 20;
    std.mem.writeInt(u32, data[0..4], 2, .little);
    for ([_]i16{ -32768, -1, 0, 32767, 1, 2, 3, 4 }, 0..) |value, index|
        std.mem.writeInt(i16, data[4 + index * 2 ..][0..2], value, .little);
    const parsed = try parse(makeRecord(&data, 0xff3f), .{});
    try std.testing.expectEqual(@as(u16, 0xff3f), parsed.flags);
    try std.testing.expectEqual(@as(u6, 63), parsed.pen_id);
    try std.testing.expect(parsed.compressed);
    try std.testing.expectEqual(@as(u32, 2), parsed.count);
    var rectangles = parsed.rect_array.rectangles();
    try std.testing.expectEqual(@as(i16, -32768), (try rectangles.next()).?.compressed.x);
    try std.testing.expectEqual(@as(i16, 4), (try rectangles.next()).?.compressed.height);

    const mapping: world_page_device.Mapper = .{ .world = .{ .m11 = 1, .m12 = 0, .m21 = 0, .m22 = 1, .dx = 10, .dy = 20 }, .device_scale = .{ .x = 2, .y = 3 } };
    var expected = rect_device_corners.fromRectArray(parsed.rect_array, mapping);
    var actual = parsed.deviceRectangles(mapping);
    try std.testing.expectEqualDeep(try expected.next(), try actual.next());
    try std.testing.expectEqualDeep(try expected.next(), try actual.next());
    try std.testing.expectEqualDeep(try expected.next(), try actual.next());
}

test "EMF+ DrawRects preserves floating rectangle bits" {
    var data = [_]u8{0} ** 20;
    std.mem.writeInt(u32, data[0..4], 1, .little);
    for ([_]f32{ -0.0, std.math.nan(f32), std.math.inf(f32), -4.5 }, 0..) |value, index|
        std.mem.writeInt(u32, data[4 + index * 4 ..][0..4], @bitCast(value), .little);
    const parsed = try parse(makeRecord(&data, 7), .{});
    try std.testing.expectEqual(@as(u6, 7), parsed.pen_id);
    try std.testing.expect(!parsed.compressed);
    var rectangles = parsed.rect_array.rectangles();
    const rectangle = (try rectangles.next()).?.float;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(rectangle.x)));
    try std.testing.expect(std.math.isNan(rectangle.y));
    try std.testing.expect(std.math.isPositiveInf(rectangle.width));
}

test "EMF+ DrawRects rejects type count ObjectID size axes truncation and limit" {
    var data = [_]u8{0} ** 36;
    std.mem.writeInt(u32, data[0..4], 2, .little);
    _ = try parse(makeRecord(data[0..20], 0x4000), .{});
    _ = try parse(makeRecord(&data, 0), .{});
    for (0..data.len + 1) |cut| {
        if (cut != 20)
            try std.testing.expectError(error.InvalidEmfPlusDrawRectsSize, parse(makeRecord(data[0..cut], 0x4000), .{}));
        if (cut != 36)
            try std.testing.expectError(error.InvalidEmfPlusDrawRectsSize, parse(makeRecord(data[0..cut], 0), .{}));
    }
    var zero_count = [_]u8{0} ** 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawRectsCount, parse(makeRecord(&zero_count, 0x4000), .{}));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(data[0..20], 0x4040), .{}));
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(data[0..20], 0x4000), .{ .max_rectangles = 1 }));
    var wrong_type = makeRecord(data[0..20], 0x4000);
    wrong_type.kind = .fill_rects;
    try std.testing.expectError(error.NotEmfPlusDrawRects, parse(wrong_type, .{}));
    var wrong_size = makeRecord(data[0..20], 0x4000);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawRectsSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(data[0..20], 0x4000);
    wrong_data_size.data_size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawRectsSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..20], 0x4000);
    wrong_slice.size = 24;
    wrong_slice.data_size = 12;
    try std.testing.expectError(error.InvalidEmfPlusDrawRectsSize, parse(wrong_slice, .{}));
}
