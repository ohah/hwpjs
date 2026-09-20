const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub const MultiplyWorldTransform = struct {
    flags: u16,
    post_multiply: bool,
    matrix: transform_matrix.TransformMatrix,
};

pub fn parse(value: record.Record) !MultiplyWorldTransform {
    if (value.kind != .multiply_world_transform) return error.NotEmfPlusMultiplyWorldTransform;
    if (value.size != 36 or value.data_size != 24 or value.data.len != 24)
        return error.InvalidEmfPlusMultiplyWorldTransformSize;
    var reader: binary.Reader = .{ .bytes = value.data };
    const matrix = try transform_matrix.read(&reader);
    std.debug.assert(reader.offset == value.data.len);
    return .{
        .flags = value.flags,
        .post_multiply = record_flags.isPostMultiply(value.flags),
        .matrix = matrix,
    };
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .multiply_world_transform,
        .flags = flags,
        .size = 36,
        .data_size = 24,
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ MultiplyWorldTransform preserves matrix bits order and A flag" {
    var data = [_]u8{0} ** 24;
    const bits = [_]u32{ 0x80000000, 0x3fc00000, 0xc0100000, 0x7f800000, 0x7fc00001, 0x41100000 };
    for (bits, 0..) |item, index|
        std.mem.writeInt(u32, data[index * 4 ..][0..4], item, .little);
    const pre = try parse(makeRecord(0xdfff, &data));
    try std.testing.expectEqual(@as(u16, 0xdfff), pre.flags);
    try std.testing.expect(!pre.post_multiply);
    try std.testing.expectEqual(bits[0], @as(u32, @bitCast(pre.matrix.m11)));
    try std.testing.expectEqual(bits[1], @as(u32, @bitCast(pre.matrix.m12)));
    try std.testing.expectEqual(bits[2], @as(u32, @bitCast(pre.matrix.m21)));
    try std.testing.expect(std.math.isPositiveInf(pre.matrix.m22));
    try std.testing.expect(std.math.isNan(pre.matrix.dx));
    try std.testing.expectEqual(@as(f32, 9), pre.matrix.dy);
    const post = try parse(makeRecord(0xffff, &data));
    try std.testing.expect(post.post_multiply);
    try std.testing.expectEqual(@as(u16, 0xffff), post.flags);
}

test "EMF+ MultiplyWorldTransform rejects type every size axis and all truncations" {
    const data = [_]u8{0} ** 24;
    for (0..24) |cut| {
        var truncated = makeRecord(0, data[0..cut]);
        truncated.size = @intCast(record.header_size + cut);
        truncated.data_size = @intCast(cut);
        try std.testing.expectError(error.InvalidEmfPlusMultiplyWorldTransformSize, parse(truncated));
    }
    var wrong_type = makeRecord(0, &data);
    wrong_type.kind = .translate_world_transform;
    try std.testing.expectError(error.NotEmfPlusMultiplyWorldTransform, parse(wrong_type));
    var wrong_size = makeRecord(0, &data);
    wrong_size.size = 32;
    try std.testing.expectError(error.InvalidEmfPlusMultiplyWorldTransformSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0, &data);
    wrong_data_size.data_size = 20;
    try std.testing.expectError(error.InvalidEmfPlusMultiplyWorldTransformSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0, &data);
    wrong_slice.data = data[0..23];
    try std.testing.expectError(error.InvalidEmfPlusMultiplyWorldTransformSize, parse(wrong_slice));
}
