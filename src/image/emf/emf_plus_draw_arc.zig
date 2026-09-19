const std = @import("std");
const binary = @import("../../binary/reader.zig");
const record = @import("emf_plus_record.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const values = @import("emf_plus_values.zig");

pub const DrawArc = struct {
    flags: u16,
    pen_id: u6,
    compressed: bool,
    start_angle: f32,
    sweep_angle: f32,
    rectangle: rect_data.RectData,
};

pub fn parse(value: record.Record) !DrawArc {
    if (value.kind != .draw_arc) return error.NotEmfPlusDrawArc;
    const compressed = record_flags.isCompressed(value.flags);
    const data_size: u32 = if (compressed) 16 else 24;
    if (value.size != data_size + 12 or value.data_size != data_size or value.data.len != data_size)
        return error.InvalidEmfPlusDrawArcSize;
    const pen_id = try record_flags.objectId(value.flags);
    var reader: binary.Reader = .{ .bytes = value.data };
    const start_angle = try values.readFloat(&reader);
    const sweep_angle = try values.readFloat(&reader);
    const rectangle = try rect_data.read(&reader, compressed);
    return .{
        .flags = value.flags,
        .pen_id = pen_id,
        .compressed = compressed,
        .start_angle = start_angle,
        .sweep_angle = sweep_angle,
        .rectangle = rectangle,
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
