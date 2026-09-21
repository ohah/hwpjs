const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush_id = @import("emf_plus_brush_id.zig");
const closed_curve_data = @import("emf_plus_closed_curve_data.zig");
const point_data = @import("emf_plus_point_data.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const Options = point_data.Options;

pub const FillClosedCurve = struct {
    flags: u16,
    brush: brush_id.BrushIdOrColor,
    winding_fill: bool,
    relative: bool,
    compressed_flag: bool,
    tension: f32,
    count: u32,
    point_data: point_data.PointData,
};

pub fn parse(value: record.Record, options: Options) !FillClosedCurve {
    if (value.kind != .fill_closed_curve) return error.NotEmfPlusFillClosedCurve;
    if (value.size < 12 or value.size % 4 != 0 or value.data_size != value.size - 12 or value.data.len != value.data_size)
        return error.InvalidEmfPlusFillClosedCurveSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const raw_brush = try reader.readInt(u32);
    const curve = closed_curve_data.parse(value.data[reader.offset..], value.flags, options) catch |err| switch (err) {
        error.InvalidEmfPlusClosedCurvePointCount => return error.InvalidEmfPlusFillClosedCurvePointCount,
        error.InvalidEmfPlusClosedCurveDataSize => return error.InvalidEmfPlusFillClosedCurveSize,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .brush = try brush_id.parse(raw_brush, value.flags),
        .winding_fill = record_flags.usesWindingFill(value.flags),
        .relative = curve.relative,
        .compressed_flag = curve.compressed_flag,
        .tension = curve.tension,
        .count = curve.count,
        .point_data = curve.point_data,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{ .offset = 0, .kind = .fill_closed_curve, .flags = flags, .size = @intCast(12 + data.len), .data_size = @intCast(data.len), .data = data, .bytes = &.{} };
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], @bitCast(value), .little);
}

test "EMF+ FillClosedCurve parses brush fill mode tension and fixed points" {
    var integer = [_]u8{0} ** 24;
    std.mem.writeInt(u32, integer[0..4], 63, .little);
    putF32(&integer, 4, -0.0);
    std.mem.writeInt(u32, integer[8..12], 3, .little);
    for ([_]i16{ -32768, 32767, -1, 1, -2, 2 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, integer[12 + index * 2 ..][0..2], coordinate, .little);
    const compressed = try parse(makeRecord(&integer, 0x603f), .{});
    try std.testing.expectEqual(@as(u16, 0x603f), compressed.flags);
    try std.testing.expectEqual(@as(u6, 63), compressed.brush.brush_id);
    try std.testing.expect(compressed.winding_fill);
    try std.testing.expect(compressed.compressed_flag);
    try std.testing.expect(!compressed.relative);
    try std.testing.expectEqual(@as(u32, 3), compressed.count);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(compressed.tension)));
    var points = compressed.point_data.points();
    try std.testing.expectEqual(@as(i16, -32768), (try points.next()).?.integer.x);

    var floating = [_]u8{0} ** 36;
    std.mem.writeInt(u32, floating[0..4], 0x44332211, .little);
    putF32(&floating, 4, std.math.nan(f32));
    std.mem.writeInt(u32, floating[8..12], 3, .little);
    const uncompressed = try parse(makeRecord(&floating, 0x9000), .{});
    try std.testing.expectEqual(@as(u32, 0x44332211), uncompressed.brush.color.raw());
    try std.testing.expect(!uncompressed.winding_fill);
    try std.testing.expect(std.math.isNan(uncompressed.tension));
}

test "EMF+ FillClosedCurve parses relative points with P over C and padding" {
    const data = [_]u8{ 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0x3f, 3, 0, 0, 0, 0x3f, 0xff, 0xc0, 1, 2, 0x7f, 0x7e, 0xaa };
    const value = try parse(makeRecord(&data, 0xc800), .{});
    try std.testing.expect(value.relative);
    try std.testing.expect(value.compressed_flag);
    try std.testing.expectEqualSlices(u8, "\xaa", value.point_data.alignment_padding);
    var points = value.point_data.points();
    try std.testing.expectEqual(@as(i16, 63), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 1), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, -1), (try points.next()).?.relative.x);
}

test "EMF+ FillClosedCurve rejects type brush count envelope truncation padding and limit" {
    var data = [_]u8{0} ** 36;
    std.mem.writeInt(u32, data[8..12], 3, .little);
    _ = try parse(makeRecord(&data, 0x8000), .{});
    for (0..12) |cut| {
        const result = parse(makeRecord(data[0..cut], 0x8000), .{});
        if (result) |_| return error.TestExpectedError else |_| {}
    }
    for (12..data.len) |cut|
        try std.testing.expectError(error.InvalidEmfPlusFillClosedCurveSize, parse(makeRecord(data[0..cut], 0x8000), .{}));
    for ([_]u32{ 0, 1, 2 }) |count| {
        var invalid = data;
        std.mem.writeInt(u32, invalid[8..12], count, .little);
        try std.testing.expectError(error.InvalidEmfPlusFillClosedCurvePointCount, parse(makeRecord(&invalid, 0x8000), .{}));
    }
    std.mem.writeInt(u32, data[0..4], 64, .little);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(&data, 0), .{}));
    std.mem.writeInt(u32, data[0..4], 0, .little);
    try std.testing.expectError(error.LimitExceeded, parse(makeRecord(&data, 0x8000), .{ .max_points = 2 }));
    var wrong_type = makeRecord(&data, 0x8000);
    wrong_type.kind = .draw_closed_curve;
    try std.testing.expectError(error.NotEmfPlusFillClosedCurve, parse(wrong_type, .{}));
    var wrong_size = makeRecord(&data, 0x8000);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillClosedCurveSize, parse(wrong_size, .{}));
    var wrong_data_size = makeRecord(&data, 0x8000);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusFillClosedCurveSize, parse(wrong_data_size, .{}));
    var wrong_slice = makeRecord(data[0..32], 0x8000);
    wrong_slice.size = 48;
    wrong_slice.data_size = 36;
    try std.testing.expectError(error.InvalidEmfPlusFillClosedCurveSize, parse(wrong_slice, .{}));

    var excessive_padding = [_]u8{0} ** 24;
    std.mem.writeInt(u32, excessive_padding[8..12], 3, .little);
    excessive_padding[12..20].* = .{ 0x3f, 0xff, 0xc0, 1, 2, 0x7f, 0x7e, 3 };
    try std.testing.expectError(error.InvalidEmfPlusFillClosedCurveSize, parse(makeRecord(&excessive_padding, 0x8800), .{}));
}
