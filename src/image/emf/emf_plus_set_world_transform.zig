const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub const SetWorldTransform = struct {
    flags: u16,
    matrix: transform_matrix.TransformMatrix,
};

pub fn parse(value: record.Record) !SetWorldTransform {
    if (value.kind != .set_world_transform) return error.NotEmfPlusSetWorldTransform;
    if (value.size != 36 or value.data_size != 24 or value.data.len != 24)
        return error.InvalidEmfPlusSetWorldTransformSize;
    var reader: binary.Reader = .{ .bytes = value.data };
    const matrix = try transform_matrix.read(&reader);
    std.debug.assert(reader.offset == value.data.len);
    return .{ .flags = value.flags, .matrix = matrix };
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .set_world_transform,
        .flags = flags,
        .size = 36,
        .data_size = 24,
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ SetWorldTransform preserves matrix bits order and ignored Flags" {
    var data = [_]u8{0} ** 24;
    const bits = [_]u32{ 0x80000000, 0x3fc00000, 0xc0100000, 0x7f800000, 0x7fc00001, 0x41100000 };
    for (bits, 0..) |item, index|
        std.mem.writeInt(u32, data[index * 4 ..][0..4], item, .little);
    for ([_]u16{ 0, 1, 0x2000, 0x8000, std.math.maxInt(u16) }) |flags| {
        const parsed = try parse(makeRecord(flags, &data));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(bits[0], @as(u32, @bitCast(parsed.matrix.m11)));
        try std.testing.expectEqual(bits[1], @as(u32, @bitCast(parsed.matrix.m12)));
        try std.testing.expectEqual(bits[2], @as(u32, @bitCast(parsed.matrix.m21)));
        try std.testing.expect(std.math.isPositiveInf(parsed.matrix.m22));
        try std.testing.expect(std.math.isNan(parsed.matrix.dx));
        try std.testing.expectEqual(@as(f32, 9), parsed.matrix.dy);
    }
}

test "EMF+ SetWorldTransform rejects type every size axis and all truncations" {
    const data = [_]u8{0} ** 24;
    for (0..24) |cut| {
        var truncated = makeRecord(0, data[0..cut]);
        truncated.size = @intCast(record.header_size + cut);
        truncated.data_size = @intCast(cut);
        try std.testing.expectError(error.InvalidEmfPlusSetWorldTransformSize, parse(truncated));
    }
    var wrong_type = makeRecord(0, &data);
    wrong_type.kind = .reset_world_transform;
    try std.testing.expectError(error.NotEmfPlusSetWorldTransform, parse(wrong_type));
    var wrong_size = makeRecord(0, &data);
    wrong_size.size = 32;
    try std.testing.expectError(error.InvalidEmfPlusSetWorldTransformSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0, &data);
    wrong_data_size.data_size = 20;
    try std.testing.expectError(error.InvalidEmfPlusSetWorldTransformSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0, &data);
    wrong_slice.data = data[0..23];
    try std.testing.expectError(error.InvalidEmfPlusSetWorldTransformSize, parse(wrong_slice));
}
