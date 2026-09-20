const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const values = @import("emf_plus_values.zig");

pub const TranslateWorldTransform = struct {
    flags: u16,
    post_multiply: bool,
    dx: f32,
    dy: f32,
};

pub fn parse(value: record.Record) !TranslateWorldTransform {
    if (value.kind != .translate_world_transform) return error.NotEmfPlusTranslateWorldTransform;
    if (value.size != 20 or value.data_size != 8 or value.data.len != 8)
        return error.InvalidEmfPlusTranslateWorldTransformSize;
    var reader: binary.Reader = .{ .bytes = value.data };
    const dx = try values.readFloat(&reader);
    const dy = try values.readFloat(&reader);
    std.debug.assert(reader.offset == value.data.len);
    return .{
        .flags = value.flags,
        .post_multiply = record_flags.isPostMultiply(value.flags),
        .dx = dx,
        .dy = dy,
    };
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .translate_world_transform,
        .flags = flags,
        .size = 20,
        .data_size = 8,
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ TranslateWorldTransform preserves float bits order and A flag" {
    var data = [_]u8{0} ** 8;
    std.mem.writeInt(u32, data[0..4], 0x80000000, .little);
    std.mem.writeInt(u32, data[4..8], 0x7fc00001, .little);
    const pre = try parse(makeRecord(0xdfff, &data));
    try std.testing.expectEqual(@as(u16, 0xdfff), pre.flags);
    try std.testing.expect(!pre.post_multiply);
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(pre.dx)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(pre.dy)));
    const post = try parse(makeRecord(0xffff, &data));
    try std.testing.expect(post.post_multiply);
    try std.testing.expectEqual(@as(u16, 0xffff), post.flags);
}

test "EMF+ TranslateWorldTransform rejects type every size axis and all truncations" {
    const data = [_]u8{0} ** 8;
    for (0..8) |cut| {
        var truncated = makeRecord(0, data[0..cut]);
        truncated.size = @intCast(record.header_size + cut);
        truncated.data_size = @intCast(cut);
        try std.testing.expectError(error.InvalidEmfPlusTranslateWorldTransformSize, parse(truncated));
    }
    var wrong_type = makeRecord(0, &data);
    wrong_type.kind = .scale_world_transform;
    try std.testing.expectError(error.NotEmfPlusTranslateWorldTransform, parse(wrong_type));
    var wrong_size = makeRecord(0, &data);
    wrong_size.size = 24;
    try std.testing.expectError(error.InvalidEmfPlusTranslateWorldTransformSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0, &data);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusTranslateWorldTransformSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0, &data);
    wrong_slice.data = data[0..7];
    try std.testing.expectError(error.InvalidEmfPlusTranslateWorldTransformSize, parse(wrong_slice));
}
