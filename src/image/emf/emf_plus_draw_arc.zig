const std = @import("std");
const arc_device_geometry = @import("emf_plus_arc_device_geometry.zig");
const arc_device_points = @import("emf_plus_arc_device_points.zig");
const arc_device_polyline = @import("emf_plus_arc_device_polyline.zig");
const arc_device_segments = @import("emf_plus_arc_device_segments.zig");
const arc_data = @import("emf_plus_arc_data.zig");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const DrawArc = struct {
    flags: u16,
    pen_id: u6,
    compressed: bool,
    start_angle: f32,
    sweep_angle: f32,
    rectangle: rect_data.RectData,

    pub fn deviceCorners(self: DrawArc, mapping: world_page_device.Mapper) rect_device_corners.Corners {
        return rect_device_corners.map(self.rectangle, mapping);
    }

    pub fn deviceArc(self: DrawArc, mapping: world_page_device.Mapper) ?arc_device_geometry.Arc {
        return arc_device_geometry.build(self.deviceCorners(mapping), self.start_angle, self.sweep_angle);
    }

    pub fn deviceEndpoints(self: DrawArc, mapping: world_page_device.Mapper) ?arc_device_points.Endpoints {
        return arc_device_points.endpoints(self.deviceArc(mapping) orelse return null);
    }

    pub fn deviceSegments(self: DrawArc, mapping: world_page_device.Mapper) ?arc_device_segments.Iterator {
        return arc_device_segments.segments(self.deviceArc(mapping) orelse return null);
    }

    pub fn devicePolyline(self: DrawArc, allocator: std.mem.Allocator, mapping: world_page_device.Mapper, options: arc_device_polyline.Options) !?arc_device_polyline.Polyline {
        return try arc_device_polyline.collect(allocator, self.deviceSegments(mapping) orelse return null, options);
    }
};

pub fn parse(value: record.Record) !DrawArc {
    if (value.kind != .draw_arc) return error.NotEmfPlusDrawArc;
    const compressed = record_flags.isCompressed(value.flags);
    const data_size = arc_data.byteLength(compressed);
    if (value.size != data_size + 12 or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusDrawArcSize;
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
        .kind = .draw_arc,
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

test "EMF+ DrawArc parses compressed rectangle Pen ID angles and ignored flags" {
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
    try std.testing.expectEqualDeep(arc_device_geometry.build(value.deviceCorners(mapping), value.start_angle, value.sweep_angle), value.deviceArc(mapping));
    try std.testing.expectEqualDeep(arc_device_points.endpoints(value.deviceArc(mapping).?), value.deviceEndpoints(mapping).?);
    var value_segments = value.deviceSegments(mapping).?;
    var expected_segments = arc_device_segments.segments(value.deviceArc(mapping).?);
    try std.testing.expectEqualDeep(expected_segments.next().?, value_segments.next().?);
    var polyline = (try value.devicePolyline(std.testing.allocator, mapping, .{ .tolerance = 1_000_000 })).?;
    defer polyline.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 5), polyline.points.len);
    try std.testing.expectEqual(value.deviceEndpoints(mapping).?.start, polyline.points[0]);
    try std.testing.expectEqual(value.deviceEndpoints(mapping).?.end, polyline.points[4]);
    var non_full = value;
    non_full.sweep_angle = -90;
    const non_full_endpoints = non_full.deviceEndpoints(mapping).?;
    try std.testing.expect(!std.meta.eql(non_full_endpoints.start, non_full_endpoints.end));
    try std.testing.expectEqualDeep(arc_device_points.endpoints(non_full.deviceArc(mapping).?), non_full_endpoints);
    var invalid = value;
    invalid.start_angle = -1;
    try std.testing.expect(invalid.deviceEndpoints(mapping) == null);
    try std.testing.expect(invalid.deviceSegments(mapping) == null);
    try std.testing.expect((try invalid.devicePolyline(std.testing.allocator, mapping, .{ .tolerance = 1 })) == null);
}

test "EMF+ DrawArc parses floating rectangle without normalizing float bits" {
    var bytes = [_]u8{0} ** 24;
    putF32(&bytes, 0, -0.0);
    putF32(&bytes, 4, std.math.nan(f32));
    for ([_]f32{ 1.25, -2.5, 3.75, -4.5 }, 0..) |coordinate, index|
        putF32(&bytes, 8 + index * 4, coordinate);
    const value = try parse(makeRecord(&bytes, 0xbf07));
    try std.testing.expectEqual(@as(u16, 0xbf07), value.flags);
    try std.testing.expectEqual(@as(u6, 7), value.pen_id);
    try std.testing.expect(!value.compressed);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(value.start_angle)));
    try std.testing.expect(std.math.isNan(value.sweep_angle));
    try std.testing.expectEqual(@as(f32, 1.25), value.rectangle.float.x);
    try std.testing.expectEqual(@as(f32, -4.5), value.rectangle.float.height);
}

test "EMF+ DrawArc rejects type ObjectID and every independent size mismatch" {
    var bytes = [_]u8{0} ** 25;
    _ = try parse(makeRecord(bytes[0..16], 0x4000));
    _ = try parse(makeRecord(bytes[0..24], 0));
    for (0..16) |cut|
        try std.testing.expectError(error.InvalidEmfPlusDrawArcSize, parse(makeRecord(bytes[0..cut], 0x4000)));
    for (17..24) |cut|
        try std.testing.expectError(error.InvalidEmfPlusDrawArcSize, parse(makeRecord(bytes[0..cut], 0)));
    try std.testing.expectError(error.InvalidEmfPlusDrawArcSize, parse(makeRecord(&bytes, 0)));
    var wrong_size = makeRecord(bytes[0..16], 0x4000);
    wrong_size.size = 36;
    try std.testing.expectError(error.InvalidEmfPlusDrawArcSize, parse(wrong_size));
    var wrong_data_size = makeRecord(bytes[0..16], 0x4000);
    wrong_data_size.data_size = 24;
    try std.testing.expectError(error.InvalidEmfPlusDrawArcSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(bytes[0..17], 0x4000);
    wrong_slice.size = 28;
    wrong_slice.data_size = 16;
    try std.testing.expectError(error.InvalidEmfPlusDrawArcSize, parse(wrong_slice));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(bytes[0..16], 0x4040)));
    var wrong_type = makeRecord(bytes[0..16], 0x4000);
    wrong_type.kind = .draw_pie;
    try std.testing.expectError(error.NotEmfPlusDrawArc, parse(wrong_type));
}
