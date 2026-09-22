const point_data = @import("emf_plus_point_data.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");

pub const Parallelogram = struct {
    upper_left: resolved.Value,
    upper_right: resolved.Value,
    lower_left: resolved.Value,
    lower_right: resolved.Value,
};

pub fn assemble(source: point_data.PointData) !Parallelogram {
    if (source.count != 3) return error.InvalidEmfPlusImageParallelogramPointCount;
    var points = resolved.points(source);
    const upper_left = (try points.next()).?;
    const upper_right = (try points.next()).?;
    const lower_left = (try points.next()).?;
    if (try points.next() != null) return error.InvalidEmfPlusImageParallelogramPointCount;
    return .{
        .upper_left = upper_left,
        .upper_right = upper_right,
        .lower_left = lower_left,
        .lower_right = extrapolate(upper_left, upper_right, lower_left),
    };
}

fn extrapolate(upper_left: resolved.Value, upper_right: resolved.Value, lower_left: resolved.Value) resolved.Value {
    return switch (upper_left) {
        .integer => |origin| .{ .integer = .{
            .x = upper_right.integer.x + lower_left.integer.x - origin.x,
            .y = upper_right.integer.y + lower_left.integer.y - origin.y,
        } },
        .floating => |origin| .{ .floating = .{
            .x = upper_right.floating.x + lower_left.floating.x - origin.x,
            .y = upper_right.floating.y + lower_left.floating.y - origin.y,
        } },
    };
}

const std = @import("std");

test "EMF+ image parallelogram resolves PointR roles and extrapolates the fourth corner" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6 };
    const value = try assemble(try point_data.parse(&bytes, 3, true, false, .{}));
    try std.testing.expectEqual(resolved.IntegerPoint{ .x = 1, .y = 2 }, value.upper_left.integer);
    try std.testing.expectEqual(resolved.IntegerPoint{ .x = 4, .y = 6 }, value.upper_right.integer);
    try std.testing.expectEqual(resolved.IntegerPoint{ .x = 9, .y = 12 }, value.lower_left.integer);
    try std.testing.expectEqual(resolved.IntegerPoint{ .x = 12, .y = 16 }, value.lower_right.integer);
}

test "EMF+ image parallelogram uses wide integer geometry without narrowing" {
    var bytes = [_]u8{0} ** 12;
    const coordinates = [_]i16{ -32_768, 32_767, 32_767, -32_768, -32_768, -32_768 };
    for (coordinates, 0..) |coordinate, index|
        std.mem.writeInt(i16, bytes[index * 2 ..][0..2], coordinate, .little);
    const value = try assemble(try point_data.parse(&bytes, 3, false, true, .{}));
    try std.testing.expectEqual(resolved.IntegerPoint{ .x = 32_767, .y = -98_303 }, value.lower_right.integer);
}

test "EMF+ image parallelogram preserves floating source roles and derives the fourth corner" {
    var bytes = [_]u8{0} ** 24;
    const bits = [_]u32{ 0x80000000, 0, @bitCast(@as(f32, 2)), @bitCast(@as(f32, 3)), @bitCast(@as(f32, 5)), @bitCast(@as(f32, 7)) };
    for (bits, 0..) |value, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], value, .little);
    const value = try assemble(try point_data.parse(&bytes, 3, false, false, .{}));
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(value.upper_left.floating.x)));
    try std.testing.expectEqual(@as(f32, 7), value.lower_right.floating.x);
    try std.testing.expectEqual(@as(f32, 10), value.lower_right.floating.y);

    const finite_coordinates = [_]f32{ 1.5, -2.5, 4, 6, -3, 8 };
    for (finite_coordinates, 0..) |coordinate, index|
        std.mem.writeInt(u32, bytes[index * 4 ..][0..4], @bitCast(coordinate), .little);
    const finite = try assemble(try point_data.parse(&bytes, 3, false, false, .{}));
    try std.testing.expectEqual(@as(f32, -0.5), finite.lower_right.floating.x);
    try std.testing.expectEqual(@as(f32, 16.5), finite.lower_right.floating.y);

    const non_finite_bits = [_]u32{ 0, 0x7fc00001, 0x7f800000, @bitCast(@as(f32, 1)), @bitCast(@as(f32, 2)), @bitCast(@as(f32, 3)) };
    for (non_finite_bits, 0..) |raw, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], raw, .little);
    const non_finite = try assemble(try point_data.parse(&bytes, 3, false, false, .{}));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(non_finite.upper_left.floating.y)));
    try std.testing.expect(std.math.isPositiveInf(non_finite.lower_right.floating.x));
    try std.testing.expect(std.math.isNan(non_finite.lower_right.floating.y));
}

test "EMF+ image parallelogram rejects other counts and borrowed truncation" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    for ([_]u32{ 0, 1, 2, 4 }) |count| {
        const source = try point_data.parse(bytes[0 .. count * 2], count, true, false, .{});
        try std.testing.expectError(error.InvalidEmfPlusImageParallelogramPointCount, assemble(source));
    }
    var truncated = try point_data.parse(bytes[0..6], 3, true, false, .{});
    truncated.bytes = bytes[0..5];
    try std.testing.expectError(error.UnexpectedEnd, assemble(truncated));
}
