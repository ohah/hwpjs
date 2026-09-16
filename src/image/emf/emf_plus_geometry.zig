const binary = @import("../../binary/reader.zig");
const values = @import("emf_plus_values.zig");

pub const PointF = struct { x: f32, y: f32 };
pub const RectF = struct { x: f32, y: f32, width: f32, height: f32 };

pub fn readPointF(reader: *binary.Reader) !PointF {
    var next = reader.*;
    const result: PointF = .{ .x = try values.readFloat(&next), .y = try values.readFloat(&next) };
    reader.* = next;
    return result;
}

pub fn readRectF(reader: *binary.Reader) !RectF {
    var next = reader.*;
    const result: RectF = .{
        .x = try values.readFloat(&next),
        .y = try values.readFloat(&next),
        .width = try values.readFloat(&next),
        .height = try values.readFloat(&next),
    };
    reader.* = next;
    return result;
}

test "EMF+ floating geometry preserves values and consumes exact widths" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 24;
    const input = [_]f32{ -0.0, 1.5, -2.25, std.math.inf(f32), std.math.nan(f32), 9.0 };
    for (input, 0..) |value, index|
        std.mem.writeInt(u32, bytes[index * 4 ..][0..4], @bitCast(value), .little);
    var reader: binary.Reader = .{ .bytes = &bytes };
    const point = try readPointF(&reader);
    try std.testing.expectEqual(@as(u32, @bitCast(input[0])), @as(u32, @bitCast(point.x)));
    try std.testing.expectEqual(input[1], point.y);
    const rect = try readRectF(&reader);
    try std.testing.expectEqual(input[2], rect.x);
    try std.testing.expect(std.math.isPositiveInf(rect.y));
    try std.testing.expect(std.math.isNan(rect.width));
    try std.testing.expectEqual(input[5], rect.height);
    try std.testing.expectEqual(bytes.len, reader.offset);
}

test "EMF+ geometry failure leaves the shared cursor unchanged" {
    const std = @import("std");
    const bytes = [_]u8{0} ** 16;
    for (0..8) |cut| {
        var point_reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, readPointF(&point_reader));
        try std.testing.expectEqual(@as(usize, 0), point_reader.offset);
    }
    for (0..16) |cut| {
        var rect_reader: binary.Reader = .{ .bytes = bytes[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, readRectF(&rect_reader));
        try std.testing.expectEqual(@as(usize, 0), rect_reader.offset);
    }
}
