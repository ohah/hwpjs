const std = @import("std");
const de_casteljau = @import("emf_plus_cubic_de_casteljau.zig");
const geometry = @import("emf_plus_geometry.zig");

pub fn evaluate(cubic: de_casteljau.Cubic, parameter: f32) !geometry.PointF {
    try de_casteljau.validateParameter(parameter);
    if (parameter == 0) return scale(difference(cubic.start, cubic.control1));
    if (parameter == 1) return scale(difference(cubic.control2, cubic.end));
    const inverse = 1.0 - parameter;
    const first = difference(cubic.start, cubic.control1);
    const second = difference(cubic.control1, cubic.control2);
    const third = difference(cubic.control2, cubic.end);
    const left = lerp(first, second, inverse, parameter);
    const right = lerp(second, third, inverse, parameter);
    const quadratic = lerp(left, right, inverse, parameter);
    return scale(quadratic);
}

fn difference(start: geometry.PointF, end: geometry.PointF) geometry.PointF {
    return .{ .x = end.x - start.x, .y = end.y - start.y };
}

fn scale(point: geometry.PointF) geometry.PointF {
    return .{ .x = 3.0 * point.x, .y = 3.0 * point.y };
}

fn lerp(start: geometry.PointF, end: geometry.PointF, inverse: f32, parameter: f32) geometry.PointF {
    return .{
        .x = inverse * start.x + parameter * end.x,
        .y = inverse * start.y + parameter * end.y,
    };
}

test "EMF+ cubic derivative evaluates endpoints and an asymmetric interior tangent" {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 1, .y = -2 },
        .control1 = .{ .x = 3, .y = 4 },
        .control2 = .{ .x = -5, .y = 6 },
        .end = .{ .x = 7, .y = -8 },
    };
    try std.testing.expectEqual(geometry.PointF{ .x = 6, .y = 18 }, try evaluate(cubic, 0));
    try std.testing.expectEqual(geometry.PointF{ .x = 36, .y = -42 }, try evaluate(cubic, 1));
    const at_quarter = try evaluate(cubic, 0.25);
    try std.testing.expectEqual(@as(f32, -3.375), at_quarter.x);
    try std.testing.expectEqual(@as(f32, 9.75), at_quarter.y);
}

test "EMF+ cubic derivative validates every parameter boundary" {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 1, .y = 2 },
        .control2 = .{ .x = 3, .y = 4 },
        .end = .{ .x = 5, .y = 6 },
    };
    for ([_]f32{ -0.001, 1.001, std.math.nan(f32), std.math.inf(f32), -std.math.inf(f32) }) |parameter|
        try std.testing.expectError(error.InvalidEmfPlusCubicParameter, evaluate(cubic, parameter));
}

test "EMF+ cubic derivative preserves stationary tangents and exceptional coordinate arithmetic" {
    const stationary: de_casteljau.Cubic = .{
        .start = .{ .x = -0.0, .y = 2 },
        .control1 = .{ .x = -0.0, .y = 2 },
        .control2 = .{ .x = 3, .y = 4 },
        .end = .{ .x = 3, .y = 4 },
    };
    const start = try evaluate(stationary, -0.0);
    const end = try evaluate(stationary, 1);
    try std.testing.expectEqual(@as(f32, 0), start.x);
    try std.testing.expectEqual(@as(f32, 0), start.y);
    try std.testing.expectEqual(@as(f32, 0), end.x);
    try std.testing.expectEqual(@as(f32, 0), end.y);

    const exceptional: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = std.math.inf(f32), .y = std.math.nan(f32) },
        .control2 = .{ .x = 1, .y = 2 },
        .end = .{ .x = 3, .y = 4 },
    };
    const value = try evaluate(exceptional, 0.5);
    try std.testing.expect(std.math.isNan(value.x));
    try std.testing.expect(std.math.isNan(value.y));
}

test "EMF+ cubic derivative endpoints ignore unrelated exceptional controls" {
    const at_start: de_casteljau.Cubic = .{
        .start = .{ .x = 1, .y = 2 },
        .control1 = .{ .x = 4, .y = 6 },
        .control2 = .{ .x = std.math.inf(f32), .y = std.math.nan(f32) },
        .end = .{ .x = -std.math.inf(f32), .y = std.math.nan(f32) },
    };
    try std.testing.expectEqual(geometry.PointF{ .x = 9, .y = 12 }, try evaluate(at_start, -0.0));

    const at_end: de_casteljau.Cubic = .{
        .start = .{ .x = std.math.inf(f32), .y = std.math.nan(f32) },
        .control1 = .{ .x = -std.math.inf(f32), .y = std.math.nan(f32) },
        .control2 = .{ .x = -2, .y = 3 },
        .end = .{ .x = 5, .y = -1 },
    };
    try std.testing.expectEqual(geometry.PointF{ .x = 21, .y = -12 }, try evaluate(at_end, 1));
}
