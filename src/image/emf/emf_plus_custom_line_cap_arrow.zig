const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const line_values = @import("emf_plus_line_values.zig");
const values = @import("emf_plus_values.zig");

pub const byte_size: usize = 52;

pub const Arrow = struct {
    width: f32,
    height: f32,
    middle_inset: f32,
    fill_state_raw: u32,
    line_start_cap: line_values.LineCapType,
    line_end_cap: line_values.LineCapType,
    line_join: line_values.LineJoinType,
    line_miter_limit: f32,
    width_scale: f32,
    fill_hot_spot: geometry.PointF,
    line_hot_spot: geometry.PointF,

    pub fn isFilled(self: Arrow) bool {
        return self.fill_state_raw != 0;
    }
};

pub fn parse(bytes: []const u8) !Arrow {
    if (bytes.len != byte_size) return error.InvalidEmfPlusCustomLineCapArrowSize;
    var reader: binary.Reader = .{ .bytes = bytes };
    const result: Arrow = .{
        .width = try values.readFloat(&reader),
        .height = try values.readFloat(&reader),
        .middle_inset = try values.readFloat(&reader),
        .fill_state_raw = try reader.readInt(u32),
        .line_start_cap = try line_values.lineCapType(try reader.readInt(u32)),
        .line_end_cap = try line_values.lineCapType(try reader.readInt(u32)),
        .line_join = try line_values.lineJoinType(try reader.readInt(u32)),
        .line_miter_limit = try values.readFloat(&reader),
        .width_scale = try values.readFloat(&reader),
        .fill_hot_spot = try geometry.readPointF(&reader),
        .line_hot_spot = try geometry.readPointF(&reader),
    };
    if (!isZero(result.fill_hot_spot) or !isZero(result.line_hot_spot))
        return error.InvalidEmfPlusCustomLineCapHotSpot;
    return result;
}

fn isZero(point: geometry.PointF) bool {
    return point.x == 0.0 and point.y == 0.0;
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    @import("std").mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ adjustable arrow cap parses exact fields and preserves BOOL raw value" {
    const std = @import("std");
    var bytes = [_]u8{0} ** byte_size;
    putF32(&bytes, 0, 4);
    putF32(&bytes, 4, 6);
    putF32(&bytes, 8, 1);
    putU32(&bytes, 12, 2);
    putU32(&bytes, 16, 0x14);
    putU32(&bytes, 20, 0x13);
    putU32(&bytes, 24, 3);
    putF32(&bytes, 28, 10);
    putF32(&bytes, 32, 1.5);
    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(f32, 4), value.width);
    try std.testing.expectEqual(@as(f32, 6), value.height);
    try std.testing.expectEqual(@as(f32, 1), value.middle_inset);
    try std.testing.expectEqual(@as(u32, 2), value.fill_state_raw);
    try std.testing.expect(value.isFilled());
    try std.testing.expectEqual(line_values.LineCapType.arrow_anchor, value.line_start_cap);
    try std.testing.expectEqual(line_values.LineCapType.diamond_anchor, value.line_end_cap);
    try std.testing.expectEqual(line_values.LineJoinType.miter_clipped, value.line_join);
    try std.testing.expectEqual(@as(f32, 10), value.line_miter_limit);
    try std.testing.expectEqual(@as(f32, 1.5), value.width_scale);
    try std.testing.expectEqual(@as(f32, 0), value.fill_hot_spot.x);
    try std.testing.expectEqual(@as(f32, 0), value.line_hot_spot.y);
}

test "EMF+ adjustable arrow cap rejects every size enum and hot spot violation" {
    const std = @import("std");
    var bytes = [_]u8{0} ** (byte_size + 1);
    for (0..bytes.len + 1) |size| if (size != byte_size)
        try std.testing.expectError(error.InvalidEmfPlusCustomLineCapArrowSize, parse(bytes[0..size]));
    putU32(&bytes, 16, 4);
    try std.testing.expectError(error.InvalidEmfPlusLineCapType, parse(bytes[0..byte_size]));
    putU32(&bytes, 16, 0);
    putU32(&bytes, 24, 4);
    try std.testing.expectError(error.InvalidEmfPlusLineJoinType, parse(bytes[0..byte_size]));
    putU32(&bytes, 24, 0);
    putF32(&bytes, 36, 1);
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapHotSpot, parse(bytes[0..byte_size]));
    putF32(&bytes, 36, 0);
    putF32(&bytes, 48, -1);
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapHotSpot, parse(bytes[0..byte_size]));
}
