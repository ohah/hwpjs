const std = @import("std");
const geometry = @import("emf_plus_geometry.zig");

pub const Cubic = struct {
    start: geometry.PointF,
    control1: geometry.PointF,
    control2: geometry.PointF,
    end: geometry.PointF,
};

pub fn evaluate(cubic: Cubic, parameter: f32) !geometry.PointF {
    if (!std.math.isFinite(parameter) or parameter < 0 or parameter > 1)
        return error.InvalidEmfPlusCubicParameter;
    if (parameter == 0) return cubic.start;
    if (parameter == 1) return cubic.end;

    const inverse = 1.0 - parameter;
    const first = lerp(cubic.start, cubic.control1, inverse, parameter);
    const second = lerp(cubic.control1, cubic.control2, inverse, parameter);
    const third = lerp(cubic.control2, cubic.end, inverse, parameter);
    const left = lerp(first, second, inverse, parameter);
    const right = lerp(second, third, inverse, parameter);
    return lerp(left, right, inverse, parameter);
}

fn lerp(start: geometry.PointF, end: geometry.PointF, inverse: f32, parameter: f32) geometry.PointF {
    return .{
        .x = inverse * start.x + parameter * end.x,
        .y = inverse * start.y + parameter * end.y,
    };
}

test "EMF+ cubic evaluation preserves endpoints and evaluates an asymmetric interior point" {
    const cubic: Cubic = .{
        .start = .{ .x = 1, .y = -2 },
        .control1 = .{ .x = 3, .y = 4 },
        .control2 = .{ .x = -5, .y = 6 },
        .end = .{ .x = 7, .y = -8 },
    };
    try std.testing.expectEqual(cubic.start, try evaluate(cubic, 0));
    try std.testing.expectEqual(cubic.end, try evaluate(cubic, 1));
    const point = try evaluate(cubic, 0.25);
    try std.testing.expectApproxEqAbs(@as(f32, 1.09375), point.x, 0.000001);
    try std.testing.expectApproxEqAbs(@as(f32, 1.5625), point.y, 0.000001);
}

test "EMF+ cubic evaluation validates every parameter boundary" {
    const cubic: Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 0, .y = 2 },
        .control2 = .{ .x = 2, .y = 2 },
        .end = .{ .x = 2, .y = 0 },
    };
    const midpoint = try evaluate(cubic, 0.5);
    try std.testing.expectEqual(@as(f32, 1), midpoint.x);
    try std.testing.expectEqual(@as(f32, 1.5), midpoint.y);
    for ([_]f32{ -0.001, 1.001, std.math.nan(f32), std.math.inf(f32), -std.math.inf(f32) }) |parameter|
        try std.testing.expectError(error.InvalidEmfPlusCubicParameter, evaluate(cubic, parameter));
}

test "EMF+ cubic endpoint fast paths preserve exceptional coordinate bits" {
    const nan_payload: f32 = @bitCast(@as(u32, 0x7fc0_1234));
    const cubic: Cubic = .{
        .start = .{ .x = -0.0, .y = nan_payload },
        .control1 = .{ .x = 1, .y = 2 },
        .control2 = .{ .x = 3, .y = 4 },
        .end = .{ .x = std.math.inf(f32), .y = -std.math.inf(f32) },
    };
    const start = try evaluate(cubic, -0.0);
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(start.x)));
    try std.testing.expectEqual(@as(u32, 0x7fc0_1234), @as(u32, @bitCast(start.y)));
    const end = try evaluate(cubic, 1);
    try std.testing.expect(std.math.isPositiveInf(end.x));
    try std.testing.expect(std.math.isNegativeInf(end.y));
}
