const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush_id = @import("emf_plus_brush_id.zig");
const point_data = @import("emf_plus_point_data.zig");
const polyline_segments = @import("emf_plus_polyline_segments.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const Options = point_data.Options;

pub const FillPolygon = struct {
    flags: u16,
    brush: brush_id.BrushIdOrColor,
    relative: bool,
    compressed_flag: bool,
    count: u32,
    point_data: point_data.PointData,

    pub fn segments(self: FillPolygon) polyline_segments.Iterator {
        return polyline_segments.segments(self.point_data, true);
    }
};

pub fn parse(value: record.Record, options: Options) !FillPolygon {
    if (value.kind != .fill_polygon) return error.NotEmfPlusFillPolygon;
    if (value.size < 12 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusFillPolygonSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const raw_brush = try reader.readInt(u32);
    const count = try reader.readInt(u32);
    if (count < 3) return error.InvalidEmfPlusFillPolygonPointCount;
    const relative = record_flags.isRelative(value.flags);
    const compressed = record_flags.isCompressed(value.flags);
    const minimum_point_bytes = std.math.mul(u64, count, if (relative) 2 else if (compressed) 4 else 8) catch
        return error.LimitExceeded;
    const minimum_data_size = std.math.add(u64, minimum_point_bytes, 8) catch return error.LimitExceeded;
    if (value.data_size < minimum_data_size) return error.InvalidEmfPlusFillPolygonSize;

    const points = point_data.parse(value.data[reader.offset..], count, relative, compressed, options) catch |err| switch (err) {
        error.InvalidEmfPlusPointDataSize, error.InvalidEmfPlusPointDataPadding => return error.InvalidEmfPlusFillPolygonSize,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .brush = try brush_id.parse(raw_brush, value.flags),
        .relative = relative,
        .compressed_flag = compressed,
        .count = count,
        .point_data = points,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{ .offset = 0, .kind = .fill_polygon, .flags = flags, .size = @intCast(12 + data.len), .data_size = @intCast(data.len), .data = data, .bytes = &.{} };
}

test "EMF+ FillPolygon parses absolute integer and floating points with both brushes" {
    var integer = [_]u8{0} ** 20;
    std.mem.writeInt(u32, integer[0..4], 63, .little);
    std.mem.writeInt(u32, integer[4..8], 3, .little);
    for ([_]i16{ -32768, 32767, -1, 1, 2, 3 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, integer[8 + index * 2 ..][0..2], coordinate, .little);
    const compressed = try parse(makeRecord(&integer, 0x7000), .{});
    try std.testing.expectEqual(@as(u16, 0x7000), compressed.flags);
    try std.testing.expectEqual(@as(u6, 63), compressed.brush.brush_id);
    try std.testing.expect(!compressed.relative);
    try std.testing.expect(compressed.compressed_flag);
    var integer_points = compressed.point_data.points();
    try std.testing.expectEqual(@as(i16, -32768), (try integer_points.next()).?.integer.x);
    _ = try integer_points.next();
    try std.testing.expectEqual(@as(i16, 3), (try integer_points.next()).?.integer.y);
    var boundary = compressed.segments();
    _ = (try boundary.next()).?;
    _ = (try boundary.next()).?;
    const maybe_closing = try boundary.next();
    try std.testing.expect(maybe_closing != null);
    const closing = maybe_closing.?;
    try std.testing.expectEqual(@as(i64, 2), closing.start.integer.x);
    try std.testing.expectEqual(@as(i64, 3), closing.start.integer.y);
    try std.testing.expectEqual(@as(i64, -32_768), closing.end.integer.x);
    try std.testing.expectEqual(@as(i64, 32_767), closing.end.integer.y);
    try std.testing.expect((try boundary.next()) == null);

    var floating = [_]u8{0} ** 32;
    std.mem.writeInt(u32, floating[0..4], 0x44332211, .little);
    std.mem.writeInt(u32, floating[4..8], 3, .little);
    const bits = [_]u32{ 0x80000000, 0x7fc00001, 0x7f800000, 0xc0900000, 0, 0x3f800000 };
    for (bits, 0..) |value, index| std.mem.writeInt(u32, floating[8 + index * 4 ..][0..4], value, .little);
    const uncompressed = try parse(makeRecord(&floating, 0xb7ff), .{});
    try std.testing.expectEqual(@as(u32, 0x44332211), uncompressed.brush.color.raw());
    try std.testing.expect(!uncompressed.relative);
    try std.testing.expect(!uncompressed.compressed_flag);
    var float_points = uncompressed.point_data.points();
    const first = (try float_points.next()).?.floating;
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(first.x)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(first.y)));
}

test "EMF+ FillPolygon parses variable PointR padding and ignores C" {
    const data = [_]u8{ 0xff, 0xff, 0xff, 0xff, 3, 0, 0, 0, 1, 2, 0x80, 0x40, 3, 4, 5, 6 };
    const value = try parse(makeRecord(&data, 0xc800), .{});
    try std.testing.expect(value.relative);
    try std.testing.expect(value.compressed_flag);
    try std.testing.expectEqual(@as(u32, 0xffffffff), value.brush.color.raw());
    try std.testing.expectEqualSlices(u8, "\x06", value.point_data.alignment_padding);
    var points = value.point_data.points();
    try std.testing.expectEqual(@as(i16, 1), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 64), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 5), (try points.next()).?.relative.y);
}

test "EMF+ FillPolygon rejects type brush count sizes truncation and limit" {
    var data = [_]u8{0} ** 32;
    std.mem.writeInt(u32, data[4..8], 3, .little);
    _ = try parse(makeRecord(&data, 0), .{});
    for (0..data.len) |cut|
        try std.testing.expectError(if (cut == 0 or cut == 4) error.UnexpectedEnd else error.InvalidEmfPlusFillPolygonSize, parse(makeRecord(data[0..cut], 0), .{}));
    for ([_]u32{ 0, 1, 2 }) |invalid_count| {
        var bad_count = data;
        std.mem.writeInt(u32, bad_count[4..8], invalid_count, .little);
        try std.testing.expectError(error.InvalidEmfPlusFillPolygonPointCount, parse(makeRecord(&bad_count, 0), .{}));
    }
    std.mem.writeInt(u32, data[0..4], 64, .little);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(&data, 0), .{}));
    std.mem.writeInt(u32, data[0..4], 0, .little);
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&data, 0), .{ .max_points = 2 }));
    var wrong_type = makeRecord(&data, 0);
    wrong_type.kind = .draw_lines;
    try std.testing.expectError(error.NotEmfPlusFillPolygon, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&data, 0);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillPolygonSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&data, 0);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusFillPolygonSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..28], 0);
    wrong_slice.size = 44;
    wrong_slice.data_size = 32;
    try std.testing.expectError(error.InvalidEmfPlusFillPolygonSize, parse(wrong_slice, .{}));
    var relative_slice = makeRecord(data[0..12], 0x0800);
    relative_slice.size = 28;
    relative_slice.data_size = 16;
    try std.testing.expectError(error.InvalidEmfPlusFillPolygonSize, parse(relative_slice, .{}));
}
