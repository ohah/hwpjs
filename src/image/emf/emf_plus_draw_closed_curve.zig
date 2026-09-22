const std = @import("std");
const cardinal_device_spans = @import("emf_plus_cardinal_device_spans.zig");
const cardinal_spans = @import("emf_plus_cardinal_spans.zig");
const closed_curve_data = @import("emf_plus_closed_curve_data.zig");
const geometry = @import("emf_plus_geometry.zig");
const page_transform = @import("emf_plus_page_transform.zig");
const point_data = @import("emf_plus_point_data.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const Options = point_data.Options;

pub const DrawClosedCurve = struct {
    flags: u16,
    pen_id: u6,
    relative: bool,
    compressed_flag: bool,
    tension: f32,
    count: u32,
    point_data: point_data.PointData,

    pub fn spans(self: DrawClosedCurve) !cardinal_spans.Iterator {
        return cardinal_spans.closed(self.point_data);
    }

    pub fn deviceSpans(self: DrawClosedCurve, mapping: world_page_device.Mapper) !cardinal_device_spans.Iterator {
        return cardinal_device_spans.fromSpans(try self.spans(), mapping);
    }
};

pub fn parse(value: record.Record, options: Options) !DrawClosedCurve {
    if (value.kind != .draw_closed_curve) return error.NotEmfPlusDrawClosedCurve;
    if (value.size < 12 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusDrawClosedCurveSize;

    const curve = closed_curve_data.parse(value.data, value.flags, options) catch |err| switch (err) {
        error.InvalidEmfPlusClosedCurvePointCount => return error.InvalidEmfPlusDrawClosedCurvePointCount,
        error.InvalidEmfPlusClosedCurveDataSize => return error.InvalidEmfPlusDrawClosedCurveSize,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .pen_id = try record_flags.objectId(value.flags),
        .relative = curve.relative,
        .compressed_flag = curve.compressed_flag,
        .tension = curve.tension,
        .count = curve.count,
        .point_data = curve.point_data,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_closed_curve,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], @bitCast(value), .little);
}

test "EMF+ DrawClosedCurve parses integer and floating points with raw tension" {
    var integer = [_]u8{0} ** 20;
    putF32(&integer, 0, -0.0);
    std.mem.writeInt(u32, integer[4..8], 3, .little);
    for ([_]i16{ -32768, 32767, -1, 1, -2, 2 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, integer[8 + index * 2 ..][0..2], coordinate, .little);
    const compressed = try parse(makeRecord(&integer, 0xf73f), .{});
    try std.testing.expectEqual(@as(u6, 63), compressed.pen_id);
    try std.testing.expect(compressed.compressed_flag);
    try std.testing.expect(!compressed.relative);
    try std.testing.expectEqual(@as(u32, 3), compressed.count);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(compressed.tension)));
    var compressed_points = compressed.point_data.points();
    try std.testing.expectEqual(@as(i16, -32768), (try compressed_points.next()).?.integer.x);
    var spans = try compressed.spans();
    try std.testing.expect((try spans.next()) != null);
    try std.testing.expect((try spans.next()) != null);
    const maybe_closing = try spans.next();
    try std.testing.expect(maybe_closing != null);
    const closing = maybe_closing.?;
    try std.testing.expectEqual(@as(i64, -2), closing.start.integer.x);
    try std.testing.expectEqual(@as(i64, -32768), closing.end.integer.x);
    try std.testing.expect((try spans.next()) == null);

    var floating = [_]u8{0} ** 32;
    putF32(&floating, 0, std.math.nan(f32));
    std.mem.writeInt(u32, floating[4..8], 3, .little);
    for ([_]f32{ -0.0, 1, 2, 3, 4, 5 }, 0..) |coordinate, index|
        putF32(&floating, 8 + index * 4, coordinate);
    const uncompressed = try parse(makeRecord(&floating, 5), .{});
    try std.testing.expect(std.math.isNan(uncompressed.tension));
    try std.testing.expectEqual(@as(u32, 3), uncompressed.count);
    var float_points = uncompressed.point_data.points();
    const first = (try float_points.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(first.x)));
}

test "EMF+ DrawClosedCurve parses relative points padding and ignores C" {
    const data = [_]u8{
        0,    0,    0,    0x3f,
        3,    0,    0,    0,
        0x3f, 0xff, 0xc0, 1,
        2,    0x7f, 0x7e, 0xaa,
    };
    const value = try parse(makeRecord(&data, 0x483f), .{});
    try std.testing.expectEqual(@as(u32, 0x3f000000), @as(u32, @bitCast(value.tension)));
    try std.testing.expect(value.relative);
    try std.testing.expect(value.compressed_flag);
    try std.testing.expectEqualSlices(u8, "\xaa", value.point_data.alignment_padding);
    var points = value.point_data.points();
    try std.testing.expectEqual(@as(i16, 63), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 1), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, -1), (try points.next()).?.relative.x);
}

test "EMF+ DrawClosedCurve exposes shared closed device cardinal spans" {
    var data = [_]u8{0} ** 20;
    std.mem.writeInt(u32, data[4..8], 3, .little);
    for ([_]i16{ 1, 2, 3, 4, 5, 6 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, data[8 + index * 2 ..][0..2], coordinate, .little);
    const value = try parse(makeRecord(&data, 0x4000), .{});
    const page = page_transform.build(.pixel, 2, .{ .x = 96, .y = 96 });
    const mapping = world_page_device.resolve(transform_matrix.TransformMatrix.translation(10, 20), page).?;
    var spans = try value.deviceSpans(mapping);
    try std.testing.expect((try spans.next()) != null);
    try std.testing.expect((try spans.next()) != null);
    const maybe_closing = try spans.next();
    try std.testing.expect(maybe_closing != null);
    const closing = maybe_closing.?;
    try std.testing.expectEqual(geometry.PointF{ .x = 30, .y = 52 }, closing.start);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, closing.end);
    try std.testing.expect((try spans.next()) == null);
}

test "EMF+ DrawClosedCurve rejects type count ObjectID sizes truncation and limit" {
    var data = [_]u8{0} ** 32;
    std.mem.writeInt(u32, data[4..8], 3, .little);
    _ = try parse(makeRecord(&data, 0), .{});
    for (0..8) |cut| {
        const result = parse(makeRecord(data[0..cut], 0), .{});
        if (result) |_| return error.TestExpectedError else |_| {}
    }
    for (8..32) |cut|
        try std.testing.expectError(error.InvalidEmfPlusDrawClosedCurveSize, parse(makeRecord(data[0..cut], 0), .{}));
    var too_few = data;
    std.mem.writeInt(u32, too_few[4..8], 2, .little);
    try std.testing.expectError(error.InvalidEmfPlusDrawClosedCurvePointCount, parse(makeRecord(&too_few, 0), .{}));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(&data, 0x0040), .{}));
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&data, 0), .{ .max_points = 2 }));
    var wrong_type = makeRecord(&data, 0);
    wrong_type.kind = .draw_curve;
    try std.testing.expectError(error.NotEmfPlusDrawClosedCurve, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&data, 0);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawClosedCurveSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&data, 0);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawClosedCurveSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..28], 0);
    wrong_slice.size = 44;
    wrong_slice.data_size = 32;
    try std.testing.expectError(error.InvalidEmfPlusDrawClosedCurveSize, parse(wrong_slice, .{}));

    var excessive_padding = [_]u8{0} ** 20;
    std.mem.writeInt(u32, excessive_padding[4..8], 3, .little);
    excessive_padding[8..16].* = .{ 0x3f, 0xff, 0xc0, 1, 2, 0x7f, 0x7e, 3 };
    try std.testing.expectError(error.InvalidEmfPlusDrawClosedCurveSize, parse(makeRecord(&excessive_padding, 0x0800), .{}));
}
