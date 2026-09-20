const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const values = @import("emf_plus_values.zig");

pub const RotateWorldTransform = struct {
    flags: u16,
    post_multiply: bool,
    angle: f32,
};

pub fn parse(value: record.Record) !RotateWorldTransform {
    if (value.kind != .rotate_world_transform) return error.NotEmfPlusRotateWorldTransform;
    if (value.size != 16 or value.data_size != 4 or value.data.len != 4)
        return error.InvalidEmfPlusRotateWorldTransformSize;
    var reader: binary.Reader = .{ .bytes = value.data };
    const angle = try values.readFloat(&reader);
    std.debug.assert(reader.offset == value.data.len);
    return .{
        .flags = value.flags,
        .post_multiply = record_flags.isPostMultiply(value.flags),
        .angle = angle,
    };
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .rotate_world_transform,
        .flags = flags,
        .size = 16,
        .data_size = 4,
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ RotateWorldTransform preserves angle bits and A flag" {
    var data = [_]u8{0} ** 4;
    std.mem.writeInt(u32, data[0..4], 0x80000000, .little);
    const pre = try parse(makeRecord(0xdfff, &data));
    try std.testing.expectEqual(@as(u16, 0xdfff), pre.flags);
    try std.testing.expect(!pre.post_multiply);
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(pre.angle)));
    std.mem.writeInt(u32, data[0..4], 0x7fc00001, .little);
    const post = try parse(makeRecord(0xffff, &data));
    try std.testing.expect(post.post_multiply);
    try std.testing.expectEqual(@as(u16, 0xffff), post.flags);
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(post.angle)));
}

test "EMF+ RotateWorldTransform rejects type every size axis and all truncations" {
    const data = [_]u8{0} ** 4;
    for (0..4) |cut| {
        var truncated = makeRecord(0, data[0..cut]);
        truncated.size = @intCast(record.header_size + cut);
        truncated.data_size = @intCast(cut);
        try std.testing.expectError(error.InvalidEmfPlusRotateWorldTransformSize, parse(truncated));
    }
    var wrong_type = makeRecord(0, &data);
    wrong_type.kind = .set_page_transform;
    try std.testing.expectError(error.NotEmfPlusRotateWorldTransform, parse(wrong_type));
    var wrong_size = makeRecord(0, &data);
    wrong_size.size = 20;
    try std.testing.expectError(error.InvalidEmfPlusRotateWorldTransformSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0, &data);
    wrong_data_size.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusRotateWorldTransformSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0, &data);
    wrong_slice.data = data[0..3];
    try std.testing.expectError(error.InvalidEmfPlusRotateWorldTransformSize, parse(wrong_slice));
}
