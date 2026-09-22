const std = @import("std");
const arc_data = @import("emf_plus_arc_data.zig");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const DrawPie = struct {
    flags: u16,
    pen_id: u6,
    compressed: bool,
    start_angle: f32,
    sweep_angle: f32,
    rectangle: rect_data.RectData,

    pub fn deviceCorners(self: DrawPie, mapping: world_page_device.Mapper) rect_device_corners.Corners {
        return rect_device_corners.map(self.rectangle, mapping);
    }
};

pub fn parse(value: record.Record) !DrawPie {
    if (value.kind != .draw_pie) return error.NotEmfPlusDrawPie;
    const compressed = record_flags.isCompressed(value.flags);
    const data_size = arc_data.byteLength(compressed);
    if (value.size != data_size + 12 or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusDrawPieSize;
    const pen_id = try record_flags.objectId(value.flags);
    var reader: binary.Reader = .{ .bytes = value.data };
    const payload = try arc_data.read(&reader, compressed);
    return .{
        .flags = value.flags,
        .pen_id = pen_id,
        .compressed = compressed,
        .start_angle = payload.start_angle,
        .sweep_angle = payload.sweep_angle,
        .rectangle = payload.rectangle,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_pie,
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

test "EMF+ DrawPie parses compressed rectangle Pen ID angles and ignored flags" {
    var bytes = [_]u8{0} ** 16;
    putF32(&bytes, 0, 450.0);
    putF32(&bytes, 4, -720.0);
    for ([_]i16{ -32768, -1, 0, 32767 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, bytes[8 + index * 2 ..][0..2], coordinate, .little);
    const value = try parse(makeRecord(&bytes, 0xff3f));
    try std.testing.expectEqual(@as(u16, 0xff3f), value.flags);
    try std.testing.expectEqual(@as(u6, 63), value.pen_id);
    try std.testing.expect(value.compressed);
    try std.testing.expectEqual(@as(f32, 450.0), value.start_angle);
    try std.testing.expectEqual(@as(f32, -720.0), value.sweep_angle);
    try std.testing.expectEqual(@as(i16, -32768), value.rectangle.compressed.x);
    try std.testing.expectEqual(@as(i16, 32767), value.rectangle.compressed.height);
    const mapping: world_page_device.Mapper = .{ .world = .{ .m11 = 1, .m12 = 0, .m21 = 0, .m22 = 1, .dx = 10, .dy = 20 }, .device_scale = .{ .x = 2, .y = 3 } };
    try std.testing.expectEqualDeep(rect_device_corners.map(value.rectangle, mapping), value.deviceCorners(mapping));
}

test "EMF+ DrawPie preserves floating rectangle and non-finite angle bits" {
    var bytes = [_]u8{0} ** 24;
    putF32(&bytes, 0, -0.0);
    putF32(&bytes, 4, std.math.nan(f32));
    for ([_]f32{ std.math.inf(f32), -2.5, 3.75, -4.5 }, 0..) |coordinate, index|
        putF32(&bytes, 8 + index * 4, coordinate);
    const value = try parse(makeRecord(&bytes, 0xbf07));
    try std.testing.expectEqual(@as(u16, 0xbf07), value.flags);
    try std.testing.expectEqual(@as(u6, 7), value.pen_id);
    try std.testing.expect(!value.compressed);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(value.start_angle)));
    try std.testing.expect(std.math.isNan(value.sweep_angle));
    try std.testing.expect(std.math.isPositiveInf(value.rectangle.float.x));
    try std.testing.expectEqual(@as(f32, -4.5), value.rectangle.float.height);
}

test "EMF+ DrawPie rejects type ObjectID and every independent size mismatch" {
    var bytes = [_]u8{0} ** 25;
    _ = try parse(makeRecord(bytes[0..16], 0x4000));
    _ = try parse(makeRecord(bytes[0..24], 0));
    for (0..bytes.len + 1) |cut| {
        if (cut != 16)
            try std.testing.expectError(error.InvalidEmfPlusDrawPieSize, parse(makeRecord(bytes[0..cut], 0x4000)));
        if (cut != 24)
            try std.testing.expectError(error.InvalidEmfPlusDrawPieSize, parse(makeRecord(bytes[0..cut], 0)));
    }
    var wrong_size = makeRecord(bytes[0..16], 0x4000);
    wrong_size.size = 36;
    try std.testing.expectError(error.InvalidEmfPlusDrawPieSize, parse(wrong_size));
    var wrong_data_size = makeRecord(bytes[0..16], 0x4000);
    wrong_data_size.data_size = 24;
    try std.testing.expectError(error.InvalidEmfPlusDrawPieSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(bytes[0..17], 0x4000);
    wrong_slice.size = 28;
    wrong_slice.data_size = 16;
    try std.testing.expectError(error.InvalidEmfPlusDrawPieSize, parse(wrong_slice));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(bytes[0..16], 0x4040)));
    var wrong_type = makeRecord(bytes[0..16], 0x4000);
    wrong_type.kind = .draw_arc;
    try std.testing.expectError(error.NotEmfPlusDrawPie, parse(wrong_type));
}
