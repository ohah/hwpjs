const std = @import("std");
const arc_device_segments = @import("emf_plus_arc_device_segments.zig");
const geometry = @import("emf_plus_geometry.zig");

pub fn evaluate(segment: arc_device_segments.Segment, parameter: f32) !geometry.PointF {
    if (!std.math.isFinite(parameter) or parameter < 0 or parameter > 1)
        return error.InvalidEmfPlusArcParameter;
    if (!std.math.isFinite(segment.control_weight) or segment.control_weight <= 0 or segment.control_weight > 1)
        return error.InvalidEmfPlusArcControlWeight;
    if (parameter == 0) return segment.start;
    if (parameter == 1) return segment.end;

    const inverse = 1.0 - parameter;
    const start_basis = inverse * inverse;
    const control_basis = 2.0 * segment.control_weight * parameter * inverse;
    const end_basis = parameter * parameter;
    const denominator = start_basis + control_basis + end_basis;
    return .{
        .x = (segment.start.x * start_basis + segment.control.x * control_basis + segment.end.x * end_basis) / denominator,
        .y = (segment.start.y * start_basis + segment.control.y * control_basis + segment.end.y * end_basis) / denominator,
    };
}

test "EMF+ Arc rational quadratic evaluation preserves endpoints and midpoint" {
    const arc: @import("emf_plus_arc_device_geometry.zig").Arc = .{
        .ellipse = .{
            .center = .{ .x = 10, .y = 20 },
            .horizontal_radius = .{ .x = 4, .y = 1 },
            .vertical_radius = .{ .x = -2, .y = 6 },
        },
        .start_degrees = 0,
        .sweep_degrees = 90,
    };
    var iterator = arc_device_segments.segments(arc);
    const segment = iterator.next().?;
    try std.testing.expectEqual(segment.start, try evaluate(segment, 0));
    try std.testing.expectEqual(segment.end, try evaluate(segment, 1));
    const midpoint = try evaluate(segment, 0.5);
    const expected = @import("emf_plus_arc_device_points.zig").pointAtDegrees(arc.ellipse, 45);
    try std.testing.expectApproxEqAbs(expected.x, midpoint.x, 0.0001);
    try std.testing.expectApproxEqAbs(expected.y, midpoint.y, 0.0001);
}

test "EMF+ Arc rational quadratic evaluation uses homogeneous denominator" {
    const segment: arc_device_segments.Segment = .{
        .start = .{ .x = 0, .y = 0 },
        .control = .{ .x = 2, .y = 4 },
        .end = .{ .x = 8, .y = 0 },
        .control_weight = 0.5,
        .start_degrees = std.math.nan(f32),
        .sweep_degrees = std.math.inf(f32),
    };
    const point = try evaluate(segment, 0.25);
    try std.testing.expectApproxEqAbs(@as(f32, 14.0 / 13.0), point.x, 0.000001);
    try std.testing.expectApproxEqAbs(@as(f32, 12.0 / 13.0), point.y, 0.000001);
}

test "EMF+ Arc rational quadratic evaluation validates parameter and weight" {
    var segment: arc_device_segments.Segment = .{
        .start = .{ .x = 0, .y = 0 },
        .control = .{ .x = 1, .y = 1 },
        .end = .{ .x = 2, .y = 0 },
        .control_weight = 1,
        .start_degrees = 0,
        .sweep_degrees = 0,
    };
    for ([_]f32{ -0.001, 1.001, std.math.nan(f32), std.math.inf(f32), -std.math.inf(f32) }) |parameter|
        try std.testing.expectError(error.InvalidEmfPlusArcParameter, evaluate(segment, parameter));

    for ([_]f32{ -1, -0.0, 0, 1.001, std.math.nan(f32), std.math.inf(f32) }) |weight| {
        segment.control_weight = weight;
        try std.testing.expectError(error.InvalidEmfPlusArcControlWeight, evaluate(segment, 0.5));
    }
    segment.control_weight = 0;
    try std.testing.expectError(error.InvalidEmfPlusArcParameter, evaluate(segment, std.math.nan(f32)));
}

test "EMF+ Arc rational quadratic endpoint fast paths preserve exceptional coordinate bits" {
    const segment: arc_device_segments.Segment = .{
        .start = .{ .x = -0.0, .y = std.math.nan(f32) },
        .control = .{ .x = 1, .y = 2 },
        .end = .{ .x = std.math.inf(f32), .y = -std.math.inf(f32) },
        .control_weight = 1,
        .start_degrees = 0,
        .sweep_degrees = 0,
    };
    const start = try evaluate(segment, -0.0);
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(start.x)));
    try std.testing.expect(std.math.isNan(start.y));
    const end = try evaluate(segment, 1);
    try std.testing.expect(std.math.isPositiveInf(end.x));
    try std.testing.expect(std.math.isNegativeInf(end.y));
}
