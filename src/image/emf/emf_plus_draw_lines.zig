const std = @import("std");
const binary = @import("../../binary/reader.zig");
const point_data = @import("emf_plus_point_data.zig");
const polyline_segments = @import("emf_plus_polyline_segments.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const Options = point_data.Options;

pub const DrawLines = struct {
    flags: u16,
    pen_id: u6,
    relative: bool,
    compressed_flag: bool,
    closes_figure: bool,
    count: u32,
    point_data: point_data.PointData,

    pub fn segments(self: DrawLines) polyline_segments.Iterator {
        return polyline_segments.segments(self.point_data, self.closes_figure);
    }
};

pub fn parse(value: record.Record, options: Options) !DrawLines {
    if (value.kind != .draw_lines) return error.NotEmfPlusDrawLines;
    if (value.size < 12 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusDrawLinesSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const count = try reader.readInt(u32);
    if (count < 2) return error.InvalidEmfPlusDrawLinesPointCount;
    const relative = record_flags.isRelative(value.flags);
    const compressed = record_flags.isCompressed(value.flags);
    const minimum_point_bytes = std.math.mul(u64, count, if (relative) 2 else if (compressed) 4 else 8) catch
        return error.LimitExceeded;
    const minimum_data_size = std.math.add(u64, minimum_point_bytes, 4) catch return error.LimitExceeded;
    if (value.data_size < minimum_data_size) return error.InvalidEmfPlusDrawLinesSize;

    const points = point_data.parse(value.data[reader.offset..], count, relative, compressed, options) catch |err| switch (err) {
        error.InvalidEmfPlusPointDataSize, error.InvalidEmfPlusPointDataPadding => return error.InvalidEmfPlusDrawLinesSize,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .pen_id = try record_flags.objectId(value.flags),
        .relative = relative,
        .compressed_flag = compressed,
        .closes_figure = record_flags.closesFigure(value.flags),
        .count = count,
        .point_data = points,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_lines,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ DrawLines parses absolute integer and floating points" {
    var integer = [_]u8{0} ** 12;
    std.mem.writeInt(u32, integer[0..4], 2, .little);
    for ([_]i16{ -32768, 32767, -1, 1 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, integer[4 + index * 2 ..][0..2], coordinate, .little);
    const compressed = try parse(makeRecord(&integer, 0x603f), .{});
    try std.testing.expectEqual(@as(u16, 0x603f), compressed.flags);
    try std.testing.expectEqual(@as(u6, 63), compressed.pen_id);
    try std.testing.expect(!compressed.relative);
    try std.testing.expect(compressed.compressed_flag);
    try std.testing.expect(compressed.closes_figure);
    try std.testing.expectEqual(@as(u32, 2), compressed.count);
    var integer_points = compressed.point_data.points();
    try std.testing.expectEqual(@as(i16, -32768), (try integer_points.next()).?.integer.x);
    try std.testing.expectEqual(@as(i16, 1), (try integer_points.next()).?.integer.y);
    var closed_segments = compressed.segments();
    const forward = (try closed_segments.next()).?;
    try std.testing.expectEqual(@as(i64, -32_768), forward.start.integer.x);
    try std.testing.expectEqual(@as(i64, -1), forward.end.integer.x);
    const maybe_closing = try closed_segments.next();
    try std.testing.expect(maybe_closing != null);
    const closing = maybe_closing.?;
    try std.testing.expectEqual(@as(i64, -1), closing.start.integer.x);
    try std.testing.expectEqual(@as(i64, -32_768), closing.end.integer.x);
    try std.testing.expect((try closed_segments.next()) == null);

    var floating = [_]u8{0} ** 20;
    std.mem.writeInt(u32, floating[0..4], 2, .little);
    for ([_]f32{ -0.0, std.math.nan(f32), std.math.inf(f32), -4.5 }, 0..) |coordinate, index|
        std.mem.writeInt(u32, floating[4 + index * 4 ..][0..4], @bitCast(coordinate), .little);
    const uncompressed = try parse(makeRecord(&floating, 5), .{});
    try std.testing.expect(!uncompressed.closes_figure);
    var float_points = uncompressed.point_data.points();
    const first = (try float_points.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(first.x)));
    try std.testing.expect(std.math.isNan(first.y));
    const second = (try float_points.next()).?.floating;
    try std.testing.expect(std.math.isPositiveInf(second.x));
    var open_segments = uncompressed.segments();
    _ = (try open_segments.next()).?;
    try std.testing.expect((try open_segments.next()) == null);
}

test "EMF+ DrawLines parses variable PointR widths padding and ignores C" {
    const data = [_]u8{
        3, 0, 0,    0,
        1, 2, 0x80, 0x40,
        3, 4, 5,    6,
    };
    const value = try parse(makeRecord(&data, 0x683f), .{});
    try std.testing.expect(value.relative);
    try std.testing.expect(value.compressed_flag);
    try std.testing.expect(value.closes_figure);
    try std.testing.expectEqual(@as(u32, 3), value.count);
    try std.testing.expectEqualSlices(u8, "\x06", value.point_data.alignment_padding);
    var points = value.point_data.points();
    try std.testing.expectEqual(@as(i16, 1), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 64), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 5), (try points.next()).?.relative.y);
    try std.testing.expect((try points.next()) == null);
}

test "EMF+ DrawLines rejects type count ObjectID sizes truncation and limit" {
    var data = [_]u8{0} ** 20;
    std.mem.writeInt(u32, data[0..4], 2, .little);
    _ = try parse(makeRecord(&data, 0), .{});
    try std.testing.expectError(error.UnexpectedEnd, parse(makeRecord(data[0..0], 0), .{}));
    for (1..20) |cut|
        try std.testing.expectError(error.InvalidEmfPlusDrawLinesSize, parse(makeRecord(data[0..cut], 0), .{}));
    for ([_]u32{ 0, 1 }) |invalid_count| {
        var bad_count = data;
        std.mem.writeInt(u32, bad_count[0..4], invalid_count, .little);
        try std.testing.expectError(error.InvalidEmfPlusDrawLinesPointCount, parse(makeRecord(&bad_count, 0), .{}));
    }
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(&data, 0x0040), .{}));
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&data, 0), .{ .max_points = 1 }));
    var wrong_type = makeRecord(&data, 0);
    wrong_type.kind = .draw_beziers;
    try std.testing.expectError(error.NotEmfPlusDrawLines, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&data, 0);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawLinesSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&data, 0);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawLinesSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..16], 0);
    wrong_slice.size = 32;
    wrong_slice.data_size = 20;
    try std.testing.expectError(error.InvalidEmfPlusDrawLinesSize, parse(wrong_slice, .{}));
    var relative_slice = makeRecord(data[0..8], 0x0800);
    relative_slice.size = 24;
    relative_slice.data_size = 12;
    try std.testing.expectError(error.InvalidEmfPlusDrawLinesSize, parse(relative_slice, .{}));
}
