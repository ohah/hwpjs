const std = @import("std");
const binary = @import("../../binary/reader.zig");
const cardinal_spans = @import("emf_plus_cardinal_spans.zig");
const point_data = @import("emf_plus_point_data.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const values = @import("emf_plus_values.zig");

pub const Options = point_data.Options;

pub const DrawCurve = struct {
    flags: u16,
    pen_id: u6,
    compressed: bool,
    tension: f32,
    offset: u32,
    num_segments: u32,
    count: u32,
    point_data: point_data.PointData,

    pub fn spans(self: DrawCurve) !cardinal_spans.Iterator {
        return cardinal_spans.open(self.point_data, self.offset, self.num_segments);
    }
};

pub fn parse(value: record.Record, options: Options) !DrawCurve {
    if (value.kind != .draw_curve) return error.NotEmfPlusDrawCurve;
    if (value.size < 12 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusDrawCurveSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const tension = try values.readFloat(&reader);
    const offset = try reader.readInt(u32);
    const num_segments = try reader.readInt(u32);
    const count = try reader.readInt(u32);
    if (count < 2) return error.InvalidEmfPlusDrawCurvePointCount;
    const compressed = record_flags.isCompressed(value.flags);
    const point_width: u64 = if (compressed) 4 else 8;
    const point_bytes = std.math.mul(u64, count, point_width) catch return error.LimitExceeded;
    const expected_data_size = std.math.add(u64, point_bytes, 16) catch return error.LimitExceeded;
    if (value.data_size != expected_data_size) return error.InvalidEmfPlusDrawCurveSize;

    const points = point_data.parse(value.data[reader.offset..], count, false, compressed, options) catch |err| switch (err) {
        error.InvalidEmfPlusPointDataSize => return error.InvalidEmfPlusDrawCurveSize,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .pen_id = try record_flags.objectId(value.flags),
        .compressed = compressed,
        .tension = tension,
        .offset = offset,
        .num_segments = num_segments,
        .count = count,
        .point_data = points,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_curve,
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

test "EMF+ DrawCurve parses integer points and ignores every reserved flag" {
    var data = [_]u8{0} ** 24;
    putF32(&data, 0, -0.0);
    std.mem.writeInt(u32, data[4..8], 0xffffffff, .little);
    std.mem.writeInt(u32, data[8..12], 0xfffffffe, .little);
    std.mem.writeInt(u32, data[12..16], 2, .little);
    for ([_]i16{ -32768, 32767, -1, 2 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, data[16 + index * 2 ..][0..2], coordinate, .little);
    const value = try parse(makeRecord(&data, 0xff3f), .{});
    try std.testing.expectEqual(@as(u16, 0xff3f), value.flags);
    try std.testing.expectEqual(@as(u6, 63), value.pen_id);
    try std.testing.expect(value.compressed);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(value.tension)));
    try std.testing.expectEqual(@as(u32, 0xffffffff), value.offset);
    try std.testing.expectEqual(@as(u32, 0xfffffffe), value.num_segments);
    try std.testing.expectEqual(@as(u32, 2), value.count);
    var points = value.point_data.points();
    try std.testing.expectEqual(@as(i16, -32768), (try points.next()).?.integer.x);
    try std.testing.expectEqual(@as(i16, -1), (try points.next()).?.integer.x);
    try std.testing.expectError(error.InvalidEmfPlusCardinalRange, value.spans());

    var selected_data = [_]u8{0} ** 32;
    std.mem.writeInt(u32, selected_data[4..8], 1, .little);
    std.mem.writeInt(u32, selected_data[8..12], 2, .little);
    std.mem.writeInt(u32, selected_data[12..16], 4, .little);
    for ([_]i16{ 1, 2, 3, 4, 5, 6, 7, 8 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, selected_data[16 + index * 2 ..][0..2], coordinate, .little);
    const selected = try parse(makeRecord(&selected_data, 0x4000), .{});
    var spans = try selected.spans();
    const maybe_first_span = try spans.next();
    try std.testing.expect(maybe_first_span != null);
    try std.testing.expectEqual(@as(i64, 3), maybe_first_span.?.start.integer.x);
    const maybe_second_span = try spans.next();
    try std.testing.expect(maybe_second_span != null);
    try std.testing.expectEqual(@as(i64, 5), maybe_second_span.?.start.integer.x);
    try std.testing.expect((try spans.next()) == null);
}

test "EMF+ DrawCurve parses floating points and preserves float bits" {
    var data = [_]u8{0} ** 32;
    putF32(&data, 0, std.math.nan(f32));
    std.mem.writeInt(u32, data[4..8], 1, .little);
    std.mem.writeInt(u32, data[8..12], 0, .little);
    std.mem.writeInt(u32, data[12..16], 2, .little);
    for ([_]f32{ -0.0, std.math.inf(f32), 3.5, -4.5 }, 0..) |coordinate, index|
        putF32(&data, 16 + index * 4, coordinate);
    const value = try parse(makeRecord(&data, 0x083f), .{});
    try std.testing.expect(!value.compressed);
    try std.testing.expect(std.math.isNan(value.tension));
    var points = value.point_data.points();
    const first = (try points.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(first.x)));
    try std.testing.expect(std.math.isPositiveInf(first.y));
}

test "EMF+ DrawCurve rejects type count ObjectID sizes truncation and limit" {
    var data = [_]u8{0} ** 32;
    std.mem.writeInt(u32, data[12..16], 2, .little);
    _ = try parse(makeRecord(&data, 0), .{});
    for (0..16) |cut| {
        const result = parse(makeRecord(data[0..cut], 0), .{});
        if (result) |_| return error.TestExpectedError else |_| {}
    }
    for (16..32) |cut|
        try std.testing.expectError(error.InvalidEmfPlusDrawCurveSize, parse(makeRecord(data[0..cut], 0), .{}));
    var too_few = data;
    std.mem.writeInt(u32, too_few[12..16], 1, .little);
    try std.testing.expectError(error.InvalidEmfPlusDrawCurvePointCount, parse(makeRecord(&too_few, 0), .{}));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(&data, 0x0040), .{}));
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&data, 0), .{ .max_points = 1 }));
    var wrong_type = makeRecord(&data, 0);
    wrong_type.kind = .draw_closed_curve;
    try std.testing.expectError(error.NotEmfPlusDrawCurve, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&data, 0);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawCurveSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&data, 0);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawCurveSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..28], 0);
    wrong_slice.size = 44;
    wrong_slice.data_size = 32;
    try std.testing.expectError(error.InvalidEmfPlusDrawCurveSize, parse(wrong_slice, .{}));
}
