const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush_id = @import("emf_plus_brush_id.zig");
const ellipse_device_basis = @import("emf_plus_ellipse_device_basis.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const FillEllipse = struct {
    flags: u16,
    brush: brush_id.BrushIdOrColor,
    compressed: bool,
    rectangle: rect_data.RectData,

    pub fn deviceCorners(self: FillEllipse, mapping: world_page_device.Mapper) rect_device_corners.Corners {
        return rect_device_corners.map(self.rectangle, mapping);
    }

    pub fn deviceEllipse(self: FillEllipse, mapping: world_page_device.Mapper) ellipse_device_basis.Basis {
        return ellipse_device_basis.fromCorners(self.deviceCorners(mapping));
    }
};

pub fn parse(value: record.Record) !FillEllipse {
    if (value.kind != .fill_ellipse) return error.NotEmfPlusFillEllipse;
    const compressed = record_flags.isCompressed(value.flags);
    const data_size: u32 = if (compressed) 12 else 20;
    if (value.size != data_size + record.header_size or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusFillEllipseSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const raw_brush = try reader.readInt(u32);
    return .{
        .flags = value.flags,
        .brush = try brush_id.parse(raw_brush, value.flags),
        .compressed = compressed,
        .rectangle = try rect_data.read(&reader, compressed),
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .fill_ellipse,
        .flags = flags,
        .size = @intCast(record.header_size + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ FillEllipse parses compressed rectangle Brush ID and ignored flags" {
    var data = [_]u8{0} ** 12;
    std.mem.writeInt(u32, data[0..4], 63, .little);
    for ([_]i16{ -32768, -1, 0, 32767 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, data[4 + index * 2 ..][0..2], coordinate, .little);
    const value = try parse(makeRecord(&data, 0x7f00));
    try std.testing.expectEqual(@as(u16, 0x7f00), value.flags);
    try std.testing.expectEqual(@as(u6, 63), value.brush.brush_id);
    try std.testing.expect(value.compressed);
    try std.testing.expectEqual(@as(i16, -32768), value.rectangle.compressed.x);
    try std.testing.expectEqual(@as(i16, -1), value.rectangle.compressed.y);
    try std.testing.expectEqual(@as(i16, 0), value.rectangle.compressed.width);
    try std.testing.expectEqual(@as(i16, 32767), value.rectangle.compressed.height);
    const mapping: world_page_device.Mapper = .{ .world = .{ .m11 = 1, .m12 = 0, .m21 = 0, .m22 = 1, .dx = 10, .dy = 20 }, .device_scale = .{ .x = 2, .y = 3 } };
    try std.testing.expectEqualDeep(rect_device_corners.map(value.rectangle, mapping), value.deviceCorners(mapping));
    try std.testing.expectEqualDeep(ellipse_device_basis.fromCorners(value.deviceCorners(mapping)), value.deviceEllipse(mapping));

    std.mem.writeInt(u32, data[0..4], 0x44332211, .little);
    const literal = try parse(makeRecord(&data, 0xc000));
    try std.testing.expectEqual(@as(u32, 0x44332211), literal.brush.color.raw());
    try std.testing.expect(literal.compressed);
}

test "EMF+ FillEllipse preserves literal ARGB and floating rectangle bits" {
    var data = [_]u8{0} ** 20;
    std.mem.writeInt(u32, data[0..4], 0x44332211, .little);
    for ([_]u32{ 0x80000000, 0x7fc00001, 0x7f800000, 0xc0900000 }, 0..) |bits, index|
        std.mem.writeInt(u32, data[4 + index * 4 ..][0..4], bits, .little);
    const value = try parse(makeRecord(&data, 0xbfff));
    try std.testing.expectEqual(@as(u16, 0xbfff), value.flags);
    try std.testing.expectEqual(@as(u32, 0x44332211), value.brush.color.raw());
    try std.testing.expect(!value.compressed);
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(value.rectangle.float.x)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(value.rectangle.float.y)));
    try std.testing.expectEqual(@as(u32, 0x7f800000), @as(u32, @bitCast(value.rectangle.float.width)));
    try std.testing.expectEqual(@as(u32, 0xc0900000), @as(u32, @bitCast(value.rectangle.float.height)));

    std.mem.writeInt(u32, data[0..4], 7, .little);
    const object = try parse(makeRecord(&data, 0));
    try std.testing.expectEqual(@as(u6, 7), object.brush.brush_id);
    try std.testing.expect(!object.compressed);
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(object.rectangle.float.x)));
}

test "EMF+ FillEllipse rejects type Brush ID and every independent size mismatch" {
    var data = [_]u8{0} ** 21;
    _ = try parse(makeRecord(data[0..12], 0x4000));
    _ = try parse(makeRecord(data[0..20], 0x8000));
    for (0..data.len + 1) |cut| {
        if (cut != 12)
            try std.testing.expectError(error.InvalidEmfPlusFillEllipseSize, parse(makeRecord(data[0..cut], 0x4000)));
        if (cut != 20)
            try std.testing.expectError(error.InvalidEmfPlusFillEllipseSize, parse(makeRecord(data[0..cut], 0x8000)));
    }
    std.mem.writeInt(u32, data[0..4], 64, .little);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(makeRecord(data[0..12], 0x4000)));
    var wrong_type = makeRecord(data[0..12], 0xc000);
    wrong_type.kind = .draw_ellipse;
    try std.testing.expectError(error.NotEmfPlusFillEllipse, parse(wrong_type));
    var wrong_size = makeRecord(data[0..12], 0xc000);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillEllipseSize, parse(wrong_size));
    var wrong_data_size = makeRecord(data[0..12], 0xc000);
    wrong_data_size.data_size += 4;
    try std.testing.expectError(error.InvalidEmfPlusFillEllipseSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(data[0..13], 0xc000);
    wrong_slice.size = 24;
    wrong_slice.data_size = 12;
    try std.testing.expectError(error.InvalidEmfPlusFillEllipseSize, parse(wrong_slice));
}
