const std = @import("std");
const de_casteljau = @import("emf_plus_cubic_de_casteljau.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const Cubic = de_casteljau.Cubic;

pub fn evaluate(cubic: Cubic, parameter: f32) !geometry.PointF {
    try de_casteljau.validateParameter(parameter);
    if (parameter == 0) return cubic.start;
    if (parameter == 1) return cubic.end;
    return (try de_casteljau.resolve(cubic, parameter)).point;
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
