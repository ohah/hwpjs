const std = @import("std");
const arc_device_geometry = @import("emf_plus_arc_device_geometry.zig");
const arc_data = @import("emf_plus_arc_data.zig");
const binary = @import("../../binary/reader.zig");
const brush_id = @import("emf_plus_brush_id.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const FillPie = struct {
    flags: u16,
    brush: brush_id.BrushIdOrColor,
    compressed: bool,
    start_angle: f32,
    sweep_angle: f32,
    rectangle: rect_data.RectData,

    pub fn deviceCorners(self: FillPie, mapping: world_page_device.Mapper) rect_device_corners.Corners {
        return rect_device_corners.map(self.rectangle, mapping);
    }

    pub fn deviceArc(self: FillPie, mapping: world_page_device.Mapper) ?arc_device_geometry.Arc {
        return arc_device_geometry.build(self.deviceCorners(mapping), self.start_angle, self.sweep_angle);
    }
};

pub fn parse(value: record.Record) !FillPie {
    if (value.kind != .fill_pie) return error.NotEmfPlusFillPie;
    const compressed = record_flags.isCompressed(value.flags);
    const data_size = arc_data.byteLength(compressed) + 4;
    if (value.size != data_size + record.header_size or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusFillPieSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const raw_brush = try reader.readInt(u32);
    const payload = try arc_data.read(&reader, compressed);
    return .{
        .flags = value.flags,
        .brush = try brush_id.parse(raw_brush, value.flags),
        .compressed = compressed,
        .start_angle = payload.start_angle,
        .sweep_angle = payload.sweep_angle,
        .rectangle = payload.rectangle,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .fill_pie,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], @bitCast(value), .little);
}

test "EMF+ FillPie parses compressed ArcData with both Brush forms and ignored flags" {
    var data = [_]u8{0} ** 20;
    std.mem.writeInt(u32, data[0..4], 63, .little);
    putF32(&data, 4, 450.0);
    putF32(&data, 8, -720.0);
    for ([_]i16{ -32768, -1, 0, 32767 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, data[12 + index * 2 ..][0..2], coordinate, .little);
    const object = try parse(makeRecord(&data, 0x7f00));
    try std.testing.expectEqual(@as(u16, 0x7f00), object.flags);
    try std.testing.expectEqual(@as(u6, 63), object.brush.brush_id);
    try std.testing.expect(object.compressed);
    try std.testing.expectEqual(@as(f32, 450.0), object.start_angle);
    try std.testing.expectEqual(@as(f32, -720.0), object.sweep_angle);
    try std.testing.expectEqual(@as(i16, -32768), object.rectangle.compressed.x);
    try std.testing.expectEqual(@as(i16, 32767), object.rectangle.compressed.height);
    const mapping: world_page_device.Mapper = .{ .world = .{ .m11 = 1, .m12 = 0, .m21 = 0, .m22 = 1, .dx = 10, .dy = 20 }, .device_scale = .{ .x = 2, .y = 3 } };
    try std.testing.expectEqualDeep(rect_device_corners.map(object.rectangle, mapping), object.deviceCorners(mapping));
    try std.testing.expectEqualDeep(arc_device_geometry.build(object.deviceCorners(mapping), object.start_angle, object.sweep_angle), object.deviceArc(mapping));

    std.mem.writeInt(u32, data[0..4], 0x44332211, .little);
    const literal = try parse(makeRecord(&data, 0xc000));
    try std.testing.expectEqual(@as(u32, 0x44332211), literal.brush.color.raw());
    try std.testing.expect(literal.compressed);
}

test "EMF+ FillPie preserves floating ArcData bits with both Brush forms" {
    var data = [_]u8{0} ** 28;
    std.mem.writeInt(u32, data[0..4], 0x44332211, .little);
    putF32(&data, 4, -0.0);
    putF32(&data, 8, std.math.nan(f32));
    for ([_]f32{ std.math.inf(f32), -2.5, 3.75, -4.5 }, 0..) |coordinate, index|
        putF32(&data, 12 + index * 4, coordinate);
    const literal = try parse(makeRecord(&data, 0xbfff));
    try std.testing.expectEqual(@as(u32, 0x44332211), literal.brush.color.raw());
    try std.testing.expect(!literal.compressed);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(literal.start_angle)));
    try std.testing.expect(std.math.isNan(literal.sweep_angle));
    try std.testing.expect(std.math.isPositiveInf(literal.rectangle.float.x));
    try std.testing.expectEqual(@as(f32, -4.5), literal.rectangle.float.height);

    std.mem.writeInt(u32, data[0..4], 7, .little);
    const object = try parse(makeRecord(&data, 0));
    try std.testing.expectEqual(@as(u6, 7), object.brush.brush_id);
    try std.testing.expect(!object.compressed);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(object.start_angle)));
}

test "EMF+ FillPie rejects type Brush ID and every independent size mismatch" {
    var data = [_]u8{0} ** 29;
    _ = try parse(makeRecord(data[0..20], 0xc000));
    _ = try parse(makeRecord(data[0..28], 0x8000));
    for (0..data.len + 1) |cut| {
        if (cut != 20)
            try std.testing.expectError(error.InvalidEmfPlusFillPieSize, parse(makeRecord(data[0..cut], 0xc000)));
        if (cut != 28)
            try std.testing.expectError(error.InvalidEmfPlusFillPieSize, parse(makeRecord(data[0..cut], 0x8000)));
    }
    std.mem.writeInt(u32, data[0..4], 64, .little);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(data[0..20], 0x4000)));
    var wrong_type = makeRecord(data[0..20], 0xc000);
    wrong_type.kind = .draw_pie;
    try std.testing.expectError(error.NotEmfPlusFillPie, parse(wrong_type));
    var wrong_size = makeRecord(data[0..20], 0xc000);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillPieSize, parse(wrong_size));
    var wrong_data_size = makeRecord(data[0..20], 0xc000);
    wrong_data_size.data_size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillPieSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(data[0..21], 0xc000);
    wrong_slice.size = 32;
    wrong_slice.data_size = 20;
    try std.testing.expectError(error.InvalidEmfPlusFillPieSize, parse(wrong_slice));
}
