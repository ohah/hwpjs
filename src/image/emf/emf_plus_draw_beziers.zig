const std = @import("std");
const binary = @import("../../binary/reader.zig");
const point_data = @import("emf_plus_point_data.zig");
const bezier_segments = @import("emf_plus_bezier_segments.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const Options = point_data.Options;

pub const DrawBeziers = struct {
    flags: u16,
    pen_id: u6,
    relative: bool,
    compressed_flag: bool,
    count: u32,
    point_data: point_data.PointData,

    pub fn segments(self: DrawBeziers) !bezier_segments.Iterator {
        return bezier_segments.segments(self.point_data);
    }
};

pub fn parse(value: record.Record, options: Options) !DrawBeziers {
    if (value.kind != .draw_beziers) return error.NotEmfPlusDrawBeziers;
    if (value.size < 12 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusDrawBeziersSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const count = try reader.readInt(u32);
    if (count < 4) return error.InvalidEmfPlusDrawBeziersPointCount;
    const relative = record_flags.isRelative(value.flags);
    const compressed = record_flags.isCompressed(value.flags);
    const minimum_point_bytes = std.math.mul(u64, count, if (relative) 2 else if (compressed) 4 else 8) catch
        return error.LimitExceeded;
    const minimum_data_size = std.math.add(u64, minimum_point_bytes, 4) catch return error.LimitExceeded;
    if (value.data_size < minimum_data_size) return error.InvalidEmfPlusDrawBeziersSize;

    const points = point_data.parse(value.data[reader.offset..], count, relative, compressed, options) catch |err| switch (err) {
        error.InvalidEmfPlusPointDataSize, error.InvalidEmfPlusPointDataPadding => return error.InvalidEmfPlusDrawBeziersSize,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .pen_id = try record_flags.objectId(value.flags),
        .relative = relative,
        .compressed_flag = compressed,
        .count = count,
        .point_data = points,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_beziers,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ DrawBeziers parses integer and floating points with Pen IDs" {
    var integer = [_]u8{0} ** 20;
    std.mem.writeInt(u32, integer[0..4], 4, .little);
    for ([_]i16{ -32768, 32767, -1, 1, -2, 2, -3, 3 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, integer[4 + index * 2 ..][0..2], coordinate, .little);
    const compressed = try parse(makeRecord(&integer, 0xf73f), .{});
    try std.testing.expectEqual(@as(u6, 63), compressed.pen_id);
    try std.testing.expect(compressed.compressed_flag);
    try std.testing.expect(!compressed.relative);
    var compressed_points = compressed.point_data.points();
    try std.testing.expectEqual(@as(i16, -32768), (try compressed_points.next()).?.integer.x);
    var integer_segments = try compressed.segments();
    const maybe_integer_segment = try integer_segments.next();
    try std.testing.expect(maybe_integer_segment != null);
    const integer_segment = maybe_integer_segment.?;
    try std.testing.expectEqual(@as(i64, -32_768), integer_segment.start.integer.x);
    try std.testing.expectEqual(@as(i64, -1), integer_segment.control1.integer.x);
    try std.testing.expectEqual(@as(i64, -2), integer_segment.control2.integer.x);
    try std.testing.expectEqual(@as(i64, -3), integer_segment.end.integer.x);
    try std.testing.expect((try integer_segments.next()) == null);

    var floating = [_]u8{0} ** 36;
    std.mem.writeInt(u32, floating[0..4], 4, .little);
    const values = [_]f32{ -0.0, std.math.nan(f32), 1, 2, 3, 4, 5, 6 };
    for (values, 0..) |coordinate, index|
        std.mem.writeInt(u32, floating[4 + index * 4 ..][0..4], @bitCast(coordinate), .little);
    const uncompressed = try parse(makeRecord(&floating, 5), .{});
    var float_points = uncompressed.point_data.points();
    const first = (try float_points.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(first.x)));
    try std.testing.expect(std.math.isNan(first.y));

    var incomplete = [_]u8{0} ** 24;
    std.mem.writeInt(u32, incomplete[0..4], 5, .little);
    const wire_valid = try parse(makeRecord(&incomplete, 0x4000), .{});
    try std.testing.expectError(error.InvalidEmfPlusBezierTopology, wire_valid.segments());
}

test "EMF+ DrawBeziers parses mixed PointR widths padding and ignores C when P is set" {
    const data = [_]u8{
        4,    0,    0,    0,
        0x3f, 0xff, 0xc0, 0x81,
        0x00, 0x80, 0x40, 1,
        2,    0x7f, 0x7e, 0xaa,
    };
    const value = try parse(makeRecord(&data, 0x483f), .{});
    try std.testing.expect(value.relative);
    try std.testing.expect(value.compressed_flag);
    try std.testing.expectEqualSlices(u8, "\xaa", value.point_data.alignment_padding);
    var points = value.point_data.points();
    try std.testing.expectEqual(@as(i16, 63), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 256), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 1), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, -1), (try points.next()).?.relative.x);
}

test "EMF+ DrawBeziers rejects type count ObjectID sizes truncation and limit" {
    var data = [_]u8{0} ** 36;
    std.mem.writeInt(u32, data[0..4], 4, .little);
    _ = try parse(makeRecord(&data, 0), .{});
    try std.testing.expectError(error.UnexpectedEnd, parse(makeRecord(data[0..0], 0), .{}));
    for (1..4) |cut|
        try std.testing.expectError(error.InvalidEmfPlusDrawBeziersSize, parse(makeRecord(data[0..cut], 0), .{}));
    for (4..36) |cut|
        try std.testing.expectError(error.InvalidEmfPlusDrawBeziersSize, parse(makeRecord(data[0..cut], 0), .{}));
    var too_few = data;
    std.mem.writeInt(u32, too_few[0..4], 3, .little);
    try std.testing.expectError(error.InvalidEmfPlusDrawBeziersPointCount, parse(makeRecord(&too_few, 0), .{}));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(&data, 0x0040), .{}));
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&data, 0), .{ .max_points = 3 }));
    var wrong_type = makeRecord(&data, 0);
    wrong_type.kind = .draw_arc;
    try std.testing.expectError(error.NotEmfPlusDrawBeziers, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&data, 0);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawBeziersSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&data, 0);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawBeziersSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..32], 0);
    wrong_slice.size = 48;
    wrong_slice.data_size = 36;
    try std.testing.expectError(error.InvalidEmfPlusDrawBeziersSize, parse(wrong_slice, .{}));
}
