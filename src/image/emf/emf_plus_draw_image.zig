const std = @import("std");
const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const image_attributes_id = @import("emf_plus_image_attributes_id.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_data = @import("emf_plus_rect_data.zig");

pub const DrawImage = struct {
    flags: u16,
    image_id: u6,
    compressed: bool,
    image_attributes: image_attributes_id.ImageAttributesId,
    source_rectangle: geometry.RectF,
    destination_rectangle: rect_data.RectData,
};

pub fn parse(value: record.Record) !DrawImage {
    if (value.kind != .draw_image) return error.NotEmfPlusDrawImage;
    const compressed = record_flags.isCompressed(value.flags);
    const data_size: u32 = if (compressed) 32 else 40;
    if (value.size != data_size + 12 or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusDrawImageSize;
    const image_id = try record_flags.objectId(value.flags);
    var reader: binary.Reader = .{ .bytes = value.data };
    const attributes = image_attributes_id.parse(try reader.readInt(u32));
    if (try reader.readInt(i32) != 2) return error.InvalidEmfPlusDrawImageSourceUnit;
    const source_rectangle = try geometry.readRectF(&reader);
    const destination_rectangle = try rect_data.read(&reader, compressed);
    return .{
        .flags = value.flags,
        .image_id = image_id,
        .compressed = compressed,
        .image_attributes = attributes,
        .source_rectangle = source_rectangle,
        .destination_rectangle = destination_rectangle,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_image,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ DrawImage parses compressed destination and both Object IDs" {
    var bytes = [_]u8{0} ** 32;
    putU32(&bytes, 0, 62);
    putU32(&bytes, 4, 2);
    for ([_]f32{ -0.0, std.math.inf(f32), std.math.nan(f32), -4.5 }, 0..) |coordinate, index|
        putF32(&bytes, 8 + index * 4, coordinate);
    for ([_]i16{ -32768, -1, 0, 32767 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, bytes[24 + index * 2 ..][0..2], coordinate, .little);
    const value = try parse(makeRecord(&bytes, 0xff3f));
    try std.testing.expectEqual(@as(u16, 0xff3f), value.flags);
    try std.testing.expectEqual(@as(u6, 63), value.image_id);
    try std.testing.expect(value.compressed);
    try std.testing.expectEqual(@as(u32, 62), value.image_attributes.raw);
    try std.testing.expectEqual(@as(u6, 62), value.image_attributes.object_id.?);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(value.source_rectangle.x)));
    try std.testing.expect(std.math.isPositiveInf(value.source_rectangle.y));
    try std.testing.expect(std.math.isNan(value.source_rectangle.width));
    try std.testing.expectEqual(@as(f32, -4.5), value.source_rectangle.height);
    try std.testing.expectEqual(@as(i16, -32768), value.destination_rectangle.compressed.x);
    try std.testing.expectEqual(@as(i16, 32767), value.destination_rectangle.compressed.height);
}

test "EMF+ DrawImage parses floating destination and preserves absent attributes raw value" {
    var bytes = [_]u8{0} ** 40;
    putU32(&bytes, 0, 0xffff_ffff);
    putU32(&bytes, 4, 2);
    for ([_]f32{ 1, 2, 3, 4, 5.25, -6.5, 7.75, -8.0 }, 0..) |coordinate, index|
        putF32(&bytes, 8 + index * 4, coordinate);
    const value = try parse(makeRecord(&bytes, 0xbf00));
    try std.testing.expectEqual(@as(u6, 0), value.image_id);
    try std.testing.expect(!value.compressed);
    try std.testing.expectEqual(@as(u32, 0xffff_ffff), value.image_attributes.raw);
    try std.testing.expect(value.image_attributes.object_id == null);
    try std.testing.expectEqual(@as(f32, 1), value.source_rectangle.x);
    try std.testing.expectEqual(@as(f32, 4), value.source_rectangle.height);
    try std.testing.expectEqual(@as(f32, 5.25), value.destination_rectangle.float.x);
    try std.testing.expectEqual(@as(f32, -8), value.destination_rectangle.float.height);
}

test "EMF+ DrawImage rejects unit type ObjectID and every independent size mismatch" {
    var bytes = [_]u8{0} ** 41;
    putU32(&bytes, 4, 2);
    _ = try parse(makeRecord(bytes[0..32], 0x4000));
    _ = try parse(makeRecord(bytes[0..40], 0));
    for (0..bytes.len + 1) |cut| {
        if (cut != 32)
            try std.testing.expectError(error.InvalidEmfPlusDrawImageSize, parse(makeRecord(bytes[0..cut], 0x4000)));
        if (cut != 40)
            try std.testing.expectError(error.InvalidEmfPlusDrawImageSize, parse(makeRecord(bytes[0..cut], 0)));
    }
    for ([_]u32{ 0, 1, 3, 6, 7, 0xffff_ffff }) |invalid_unit| {
        var bad_unit = bytes;
        putU32(&bad_unit, 4, invalid_unit);
        try std.testing.expectError(error.InvalidEmfPlusDrawImageSourceUnit, parse(makeRecord(bad_unit[0..32], 0x4000)));
    }
    var wrong_size = makeRecord(bytes[0..32], 0x4000);
    wrong_size.size = 52;
    try std.testing.expectError(error.InvalidEmfPlusDrawImageSize, parse(wrong_size));
    var wrong_data_size = makeRecord(bytes[0..32], 0x4000);
    wrong_data_size.data_size = 40;
    try std.testing.expectError(error.InvalidEmfPlusDrawImageSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(bytes[0..33], 0x4000);
    wrong_slice.size = 44;
    wrong_slice.data_size = 32;
    try std.testing.expectError(error.InvalidEmfPlusDrawImageSize, parse(wrong_slice));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(bytes[0..32], 0x4040)));
    var wrong_type = makeRecord(bytes[0..32], 0x4000);
    wrong_type.kind = .draw_image_points;
    try std.testing.expectError(error.NotEmfPlusDrawImage, parse(wrong_type));
}
