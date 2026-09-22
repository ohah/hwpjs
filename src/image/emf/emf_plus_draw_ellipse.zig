const std = @import("std");
const arc_device_segments = @import("emf_plus_arc_device_segments.zig");
const binary = @import("../../binary/reader.zig");
const ellipse_device_basis = @import("emf_plus_ellipse_device_basis.zig");
const ellipse_device_segments = @import("emf_plus_ellipse_device_segments.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const DrawEllipse = struct {
    flags: u16,
    pen_id: u6,
    compressed: bool,
    rectangle: rect_data.RectData,

    pub fn deviceCorners(self: DrawEllipse, mapping: world_page_device.Mapper) rect_device_corners.Corners {
        return rect_device_corners.map(self.rectangle, mapping);
    }

    pub fn deviceEllipse(self: DrawEllipse, mapping: world_page_device.Mapper) ellipse_device_basis.Basis {
        return ellipse_device_basis.fromCorners(self.deviceCorners(mapping));
    }

    pub fn deviceSegments(self: DrawEllipse, mapping: world_page_device.Mapper) arc_device_segments.Iterator {
        return ellipse_device_segments.segments(self.deviceEllipse(mapping));
    }
};

pub fn parse(value: record.Record) !DrawEllipse {
    if (value.kind != .draw_ellipse) return error.NotEmfPlusDrawEllipse;
    const compressed = record_flags.isCompressed(value.flags);
    const data_size: u32 = if (compressed) 8 else 16;
    if (value.size != data_size + 12 or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusDrawEllipseSize;
    const pen_id = try record_flags.objectId(value.flags);
    var reader: binary.Reader = .{ .bytes = value.data };
    return .{
        .flags = value.flags,
        .pen_id = pen_id,
        .compressed = compressed,
        .rectangle = try rect_data.read(&reader, compressed),
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_ellipse,
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

fn nextExpectedSegment(iterator: *arc_device_segments.Iterator) !arc_device_segments.Segment {
    return iterator.next() orelse error.TestExpectedEllipseSegment;
}

test "EMF+ DrawEllipse parses compressed rectangle Pen ID and ignored flags" {
    var bytes = [_]u8{0} ** 8;
    for ([_]i16{ -32768, -1, 0, 32767 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, bytes[index * 2 ..][0..2], coordinate, .little);
    const value = try parse(makeRecord(&bytes, 0xff3f));
    try std.testing.expectEqual(@as(u16, 0xff3f), value.flags);
    try std.testing.expectEqual(@as(u6, 63), value.pen_id);
    try std.testing.expect(value.compressed);
    try std.testing.expectEqual(@as(i16, -32768), value.rectangle.compressed.x);
    try std.testing.expectEqual(@as(i16, -1), value.rectangle.compressed.y);
    try std.testing.expectEqual(@as(i16, 0), value.rectangle.compressed.width);
    try std.testing.expectEqual(@as(i16, 32767), value.rectangle.compressed.height);
    const mapping: world_page_device.Mapper = .{ .world = .{ .m11 = 1, .m12 = 0, .m21 = 0, .m22 = 1, .dx = 10, .dy = 20 }, .device_scale = .{ .x = 2, .y = 3 } };
    try std.testing.expectEqualDeep(rect_device_corners.map(value.rectangle, mapping), value.deviceCorners(mapping));
    try std.testing.expectEqualDeep(ellipse_device_basis.fromCorners(value.deviceCorners(mapping)), value.deviceEllipse(mapping));
    var expected_segments = ellipse_device_segments.segments(value.deviceEllipse(mapping));
    var actual_segments = value.deviceSegments(mapping);
    inline for (0..4) |_| try std.testing.expectEqualDeep(try nextExpectedSegment(&expected_segments), try nextExpectedSegment(&actual_segments));
    try std.testing.expect(expected_segments.next() == null);
    try std.testing.expect(actual_segments.next() == null);
}

test "EMF+ DrawEllipse parses floating rectangle without normalizing float bits" {
    var bytes = [_]u8{0} ** 16;
    for ([_]f32{ -0.0, std.math.inf(f32), std.math.nan(f32), -4.5 }, 0..) |coordinate, index|
        putF32(&bytes, index * 4, coordinate);
    const value = try parse(makeRecord(&bytes, 0xbf07));
    try std.testing.expectEqual(@as(u16, 0xbf07), value.flags);
    try std.testing.expectEqual(@as(u6, 7), value.pen_id);
    try std.testing.expect(!value.compressed);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(value.rectangle.float.x)));
    try std.testing.expect(std.math.isPositiveInf(value.rectangle.float.y));
    try std.testing.expect(std.math.isNan(value.rectangle.float.width));
    try std.testing.expectEqual(@as(f32, -4.5), value.rectangle.float.height);
}

test "EMF+ DrawEllipse rejects type ObjectID and every independent size mismatch" {
    var bytes = [_]u8{0} ** 17;
    _ = try parse(makeRecord(bytes[0..8], 0x4000));
    _ = try parse(makeRecord(bytes[0..16], 0));
    for (0..bytes.len + 1) |cut| {
        if (cut != 8)
            try std.testing.expectError(error.InvalidEmfPlusDrawEllipseSize, parse(makeRecord(bytes[0..cut], 0x4000)));
        if (cut != 16)
            try std.testing.expectError(error.InvalidEmfPlusDrawEllipseSize, parse(makeRecord(bytes[0..cut], 0)));
    }
    var wrong_size = makeRecord(bytes[0..8], 0x4000);
    wrong_size.size = 28;
    try std.testing.expectError(error.InvalidEmfPlusDrawEllipseSize, parse(wrong_size));
    var wrong_data_size = makeRecord(bytes[0..8], 0x4000);
    wrong_data_size.data_size = 16;
    try std.testing.expectError(error.InvalidEmfPlusDrawEllipseSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(bytes[0..9], 0x4000);
    wrong_slice.size = 20;
    wrong_slice.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusDrawEllipseSize, parse(wrong_slice));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(bytes[0..8], 0x4040)));
    var wrong_type = makeRecord(bytes[0..8], 0x4000);
    wrong_type.kind = .draw_pie;
    try std.testing.expectError(error.NotEmfPlusDrawEllipse, parse(wrong_type));
}
