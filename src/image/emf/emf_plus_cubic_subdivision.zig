const std = @import("std");
const de_casteljau = @import("emf_plus_cubic_de_casteljau.zig");

pub const Split = struct {
    left: de_casteljau.Cubic,
    right: de_casteljau.Cubic,
};

pub fn split(cubic: de_casteljau.Cubic, parameter: f32) !Split {
    try de_casteljau.validateParameter(parameter);
    if (parameter == 0) return .{
        .left = collapsed(cubic.start),
        .right = cubic,
    };
    if (parameter == 1) return .{
        .left = cubic,
        .right = collapsed(cubic.end),
    };

    const levels = try de_casteljau.resolve(cubic, parameter);
    return .{
        .left = .{
            .start = cubic.start,
            .control1 = levels.first1,
            .control2 = levels.second1,
            .end = levels.point,
        },
        .right = .{
            .start = levels.point,
            .control1 = levels.second2,
            .control2 = levels.first3,
            .end = cubic.end,
        },
    };
}

fn collapsed(point: @import("emf_plus_geometry.zig").PointF) de_casteljau.Cubic {
    return .{ .start = point, .control1 = point, .control2 = point, .end = point };
}

const evaluation = @import("emf_plus_cubic_evaluation.zig");

fn expectPointApprox(expected: @import("emf_plus_geometry.zig").PointF, actual: @import("emf_plus_geometry.zig").PointF) !void {
    try std.testing.expectApproxEqAbs(expected.x, actual.x, 0.00001);
    try std.testing.expectApproxEqAbs(expected.y, actual.y, 0.00001);
}

fn expectPointBits(expected: @import("emf_plus_geometry.zig").PointF, actual: @import("emf_plus_geometry.zig").PointF) !void {
    try std.testing.expectEqual(@as(u32, @bitCast(expected.x)), @as(u32, @bitCast(actual.x)));
    try std.testing.expectEqual(@as(u32, @bitCast(expected.y)), @as(u32, @bitCast(actual.y)));
}

fn expectCubicBits(expected: de_casteljau.Cubic, actual: de_casteljau.Cubic) !void {
    try expectPointBits(expected.start, actual.start);
    try expectPointBits(expected.control1, actual.control1);
    try expectPointBits(expected.control2, actual.control2);
    try expectPointBits(expected.end, actual.end);
}

test "EMF+ cubic subdivision preserves both reparameterized curve halves" {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 1, .y = -2 },
        .control1 = .{ .x = 3, .y = 4 },
        .control2 = .{ .x = -5, .y = 6 },
        .end = .{ .x = 7, .y = -8 },
    };
    const parameter: f32 = 0.25;
    const result = try split(cubic, parameter);
    try std.testing.expectEqual(result.left.end, result.right.start);
    for ([_]f32{ 0, 0.25, 0.5, 0.75, 1 }) |local| {
        try expectPointApprox(try evaluation.evaluate(cubic, parameter * local), try evaluation.evaluate(result.left, local));
        try expectPointApprox(try evaluation.evaluate(cubic, parameter + (1 - parameter) * local), try evaluation.evaluate(result.right, local));
    }
}

test "EMF+ cubic subdivision endpoints preserve original and collapsed control bits" {
    const nan_payload: f32 = @bitCast(@as(u32, 0x7fc0_1234));
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = -0.0, .y = nan_payload },
        .control1 = .{ .x = 1, .y = 2 },
        .control2 = .{ .x = 3, .y = 4 },
        .end = .{ .x = std.math.inf(f32), .y = -std.math.inf(f32) },
    };
    const at_start = try split(cubic, -0.0);
    try expectCubicBits(cubic, at_start.right);
    inline for (.{ at_start.left.start, at_start.left.control1, at_start.left.control2, at_start.left.end }) |point| {
        try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(point.x)));
        try std.testing.expectEqual(@as(u32, 0x7fc0_1234), @as(u32, @bitCast(point.y)));
    }
    const at_end = try split(cubic, 1);
    try expectCubicBits(cubic, at_end.left);
    inline for (.{ at_end.right.start, at_end.right.control1, at_end.right.control2, at_end.right.end }) |point| {
        try std.testing.expect(std.math.isPositiveInf(point.x));
        try std.testing.expect(std.math.isNegativeInf(point.y));
    }
}

test "EMF+ cubic subdivision validates every parameter boundary" {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 1, .y = 2 },
        .control2 = .{ .x = 3, .y = 4 },
        .end = .{ .x = 5, .y = 6 },
    };
    for ([_]f32{ -0.001, 1.001, std.math.nan(f32), std.math.inf(f32), -std.math.inf(f32) }) |parameter|
        try std.testing.expectError(error.InvalidEmfPlusCubicParameter, split(cubic, parameter));
}
