const std = @import("std");
const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const image_attributes_id = @import("emf_plus_image_attributes_id.zig");
const image_affine_map = @import("emf_plus_image_affine_map.zig");
const image_parallelogram = @import("emf_plus_image_parallelogram.zig");
const point_data = @import("emf_plus_point_data.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const DrawImagePoints = struct {
    flags: u16,
    image_id: u6,
    relative: bool,
    compressed_flag: bool,
    has_effect: bool,
    image_attributes: image_attributes_id.ImageAttributesId,
    source_rectangle: geometry.RectF,
    count: u32,
    point_data: point_data.PointData,

    pub fn destinationParallelogram(self: DrawImagePoints) !image_parallelogram.Parallelogram {
        return image_parallelogram.assemble(self.point_data);
    }

    pub fn sourceToDestinationTransform(self: DrawImagePoints) !@import("emf_plus_transform_matrix.zig").TransformMatrix {
        return image_affine_map.build(self.source_rectangle, try self.destinationParallelogram());
    }
};

pub fn parse(value: record.Record) !DrawImagePoints {
    if (value.kind != .draw_image_points) return error.NotEmfPlusDrawImagePoints;
    const relative = record_flags.isRelative(value.flags);
    const compressed = record_flags.isCompressed(value.flags);
    const data_size: u32 = if (relative) 36 else if (compressed) 40 else 52;
    if (value.size != data_size + 12 or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusDrawImagePointsSize;

    var reader: binary.Reader = .{ .bytes = value.data };
    const attributes = image_attributes_id.parse(try reader.readInt(u32));
    if (try reader.readInt(i32) != 2) return error.InvalidEmfPlusDrawImagePointsSourceUnit;
    const source_rectangle = try geometry.readRectF(&reader);
    const count = try reader.readInt(u32);
    if (count != 3) return error.InvalidEmfPlusDrawImagePointsCount;
    const points = point_data.parse(value.data[reader.offset..], count, relative, compressed, .{ .max_points = 3 }) catch |err| switch (err) {
        error.InvalidEmfPlusPointDataSize, error.InvalidEmfPlusPointDataPadding => return error.InvalidEmfPlusDrawImagePointsSize,
        else => return err,
    };
    return .{
        .flags = value.flags,
        .image_id = try record_flags.objectId(value.flags),
        .relative = relative,
        .compressed_flag = compressed,
        .has_effect = record_flags.hasEffect(value.flags),
        .image_attributes = attributes,
        .source_rectangle = source_rectangle,
        .count = count,
        .point_data = points,
    };
}

fn makeRecord(data: []const u8, flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .draw_image_points,
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

fn writePrefix(bytes: []u8, attributes: u32) void {
    putU32(bytes, 0, attributes);
    putU32(bytes, 4, 2);
    for ([_]f32{ -0.0, std.math.inf(f32), std.math.nan(f32), -4.5 }, 0..) |coordinate, index|
        putF32(bytes, 8 + index * 4, coordinate);
    putU32(bytes, 24, 3);
}

test "EMF+ DrawImagePoints parses relative points effect and ignores C" {
    var bytes = [_]u8{0} ** 36;
    writePrefix(&bytes, 62);
    bytes[28..36].* = .{ 1, 2, 3, 4, 5, 6, 0xaa, 0xbb };
    const value = try parse(makeRecord(&bytes, 0x683f));
    try std.testing.expectEqual(@as(u6, 63), value.image_id);
    try std.testing.expect(value.relative);
    try std.testing.expect(value.compressed_flag);
    try std.testing.expect(value.has_effect);
    try std.testing.expectEqual(@as(u32, 3), value.count);
    try std.testing.expectEqual(@as(u6, 62), value.image_attributes.object_id.?);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(value.source_rectangle.x)));
    try std.testing.expect(std.math.isPositiveInf(value.source_rectangle.y));
    try std.testing.expect(std.math.isNan(value.source_rectangle.width));
    try std.testing.expectEqualSlices(u8, "\xaa\xbb", value.point_data.alignment_padding);
    var points = value.point_data.points();
    try std.testing.expectEqual(@as(i16, 1), (try points.next()).?.relative.x);
    try std.testing.expectEqual(@as(i16, 4), (try points.next()).?.relative.y);
    try std.testing.expectEqual(@as(i16, 5), (try points.next()).?.relative.x);
    try std.testing.expect((try points.next()) == null);
    const destination = try value.destinationParallelogram();
    try std.testing.expectEqual(@as(i64, 1), destination.upper_left.integer.x);
    try std.testing.expectEqual(@as(i64, 4), destination.upper_right.integer.x);
    try std.testing.expectEqual(@as(i64, 9), destination.lower_left.integer.x);
    try std.testing.expectEqual(@as(i64, 12), destination.lower_right.integer.x);
}

test "EMF+ DrawImagePoints parses absolute integer and floating points" {
    var integer = [_]u8{0} ** 40;
    writePrefix(&integer, 0xffff_ffff);
    for ([_]i16{ -32768, 32767, -1, 1, -2, 2 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, integer[28 + index * 2 ..][0..2], coordinate, .little);
    const compressed = try parse(makeRecord(&integer, 0x4005));
    try std.testing.expect(!compressed.relative);
    try std.testing.expect(compressed.compressed_flag);
    try std.testing.expect(!compressed.has_effect);
    try std.testing.expectEqual(@as(u32, 3), compressed.count);
    try std.testing.expect(compressed.image_attributes.object_id == null);
    var integer_points = compressed.point_data.points();
    try std.testing.expectEqual(@as(i16, -32768), (try integer_points.next()).?.integer.x);
    try std.testing.expectEqual(@as(i16, 1), (try integer_points.next()).?.integer.y);
    try std.testing.expectEqual(@as(i16, 2), (try integer_points.next()).?.integer.y);
    try std.testing.expect((try integer_points.next()) == null);

    var floating = [_]u8{0} ** 52;
    writePrefix(&floating, 7);
    for ([_]f32{ -0.0, std.math.nan(f32), 1, 2, 3, 4 }, 0..) |coordinate, index|
        putF32(&floating, 28 + index * 4, coordinate);
    const uncompressed = try parse(makeRecord(&floating, 5));
    try std.testing.expect(!uncompressed.compressed_flag);
    var float_points = uncompressed.point_data.points();
    const first = (try float_points.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(first.x)));
    try std.testing.expect(std.math.isNan(first.y));

    var mapped = [_]u8{0} ** 40;
    writePrefix(&mapped, 0xffff_ffff);
    for ([_]f32{ 10, 20, 4, 5 }, 0..) |coordinate, index| putF32(&mapped, 8 + index * 4, coordinate);
    for ([_]i16{ 100, 200, 108, 204, 97, 215 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, mapped[28 + index * 2 ..][0..2], coordinate, .little);
    const transform = try (try parse(makeRecord(&mapped, 0x4000))).sourceToDestinationTransform();
    try std.testing.expectApproxEqAbs(@as(f32, 2), transform.m11, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 1), transform.m12, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, -0.6), transform.m21, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 3), transform.m22, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 92), transform.dx, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 130), transform.dy, 0.0001);
}

test "EMF+ DrawImagePoints rejects type count unit ObjectID and every size mismatch" {
    var bytes = [_]u8{0} ** 53;
    writePrefix(&bytes, 0xffff_ffff);
    _ = try parse(makeRecord(bytes[0..36], 0x0800));
    _ = try parse(makeRecord(bytes[0..40], 0x4000));
    _ = try parse(makeRecord(bytes[0..52], 0));
    for (0..bytes.len + 1) |cut| {
        if (cut != 36) try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsSize, parse(makeRecord(bytes[0..cut], 0x0800)));
        if (cut != 40) try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsSize, parse(makeRecord(bytes[0..cut], 0x4000)));
        if (cut != 52) try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsSize, parse(makeRecord(bytes[0..cut], 0)));
    }
    for ([_]u32{ 0, 1, 3, 6, 7, 0xffff_ffff }) |invalid_unit| {
        var bad_unit = bytes;
        putU32(&bad_unit, 4, invalid_unit);
        try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsSourceUnit, parse(makeRecord(bad_unit[0..36], 0x0800)));
    }
    for ([_]u32{ 0, 1, 2, 4, 0xffff_ffff }) |invalid_count| {
        var bad_count = bytes;
        putU32(&bad_count, 24, invalid_count);
        try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsCount, parse(makeRecord(bad_count[0..36], 0x0800)));
    }
    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(bytes[0..36], 0x0840)));
    var wrong_type = makeRecord(bytes[0..36], 0x0800);
    wrong_type.kind = .draw_image;
    try std.testing.expectError(error.NotEmfPlusDrawImagePoints, parse(wrong_type));
    var wrong_size = makeRecord(bytes[0..36], 0x0800);
    wrong_size.size += 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsSize, parse(wrong_size));
    var wrong_data_size = makeRecord(bytes[0..36], 0x0800);
    wrong_data_size.data_size -= 4;
    try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(bytes[0..37], 0x0800);
    wrong_slice.size = 48;
    wrong_slice.data_size = 36;
    try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsSize, parse(wrong_slice));
}
