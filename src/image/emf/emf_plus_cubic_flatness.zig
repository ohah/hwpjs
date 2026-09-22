const std = @import("std");
const de_casteljau = @import("emf_plus_cubic_de_casteljau.zig");
const geometry = @import("emf_plus_geometry.zig");

pub fn maximumControlDistanceSquared(cubic: de_casteljau.Cubic) !f64 {
    try validateCubic(cubic);
    const start = wide(cubic.start);
    const end = wide(cubic.end);
    const chord_x = end.x - start.x;
    const chord_y = end.y - start.y;
    const chord_squared = chord_x * chord_x + chord_y * chord_y;
    if (chord_squared == 0) {
        return @max(pointDistanceSquared(start, wide(cubic.control1)), pointDistanceSquared(start, wide(cubic.control2)));
    }
    return @max(
        lineDistanceSquared(start, chord_x, chord_y, chord_squared, wide(cubic.control1)),
        lineDistanceSquared(start, chord_x, chord_y, chord_squared, wide(cubic.control2)),
    );
}

const WidePoint = struct { x: f64, y: f64 };

fn wide(point: geometry.PointF) WidePoint {
    return .{ .x = @floatCast(point.x), .y = @floatCast(point.y) };
}

fn validateCubic(cubic: de_casteljau.Cubic) !void {
    inline for (.{ cubic.start, cubic.control1, cubic.control2, cubic.end }) |point| {
        if (!std.math.isFinite(point.x) or !std.math.isFinite(point.y))
            return error.InvalidEmfPlusCubicCoordinate;
    }
}

fn pointDistanceSquared(origin: WidePoint, point: WidePoint) f64 {
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    return x * x + y * y;
}

fn lineDistanceSquared(start: WidePoint, chord_x: f64, chord_y: f64, chord_squared: f64, point: WidePoint) f64 {
    const relative_x = point.x - start.x;
    const relative_y = point.y - start.y;
    const cross = chord_x * relative_y - chord_y * relative_x;
    return cross * cross / chord_squared;
}

test "EMF+ cubic flatness measures the farthest control point from its chord" {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 1, .y = 2 },
        .control1 = .{ .x = 3, .y = 6 },
        .control2 = .{ .x = 7, .y = -4 },
        .end = .{ .x = 9, .y = 2 },
    };
    try std.testing.expectEqual(@as(f64, 36), try maximumControlDistanceSquared(cubic));

    const reversed: de_casteljau.Cubic = .{
        .start = cubic.end,
        .control1 = cubic.control2,
        .control2 = cubic.control1,
        .end = cubic.start,
    };
    try std.testing.expectEqual(@as(f64, 36), try maximumControlDistanceSquared(reversed));
}

test "EMF+ cubic flatness handles straight and degenerate chords without division by zero" {
    const straight: de_casteljau.Cubic = .{
        .start = .{ .x = -2, .y = -1 },
        .control1 = .{ .x = 0, .y = 0 },
        .control2 = .{ .x = 4, .y = 2 },
        .end = .{ .x = 8, .y = 4 },
    };
    try std.testing.expectEqual(@as(f64, 0), try maximumControlDistanceSquared(straight));

    const degenerate: de_casteljau.Cubic = .{
        .start = .{ .x = 1, .y = 2 },
        .control1 = .{ .x = 4, .y = 6 },
        .control2 = .{ .x = -7, .y = 8 },
        .end = .{ .x = 1, .y = 2 },
    };
    try std.testing.expectEqual(@as(f64, 100), try maximumControlDistanceSquared(degenerate));

    const first_farther: de_casteljau.Cubic = .{
        .start = degenerate.start,
        .control1 = degenerate.control2,
        .control2 = degenerate.control1,
        .end = degenerate.end,
    };
    try std.testing.expectEqual(@as(f64, 100), try maximumControlDistanceSquared(first_farther));
}

test "EMF+ cubic flatness widens finite f32 coordinates and rejects nonfinite coordinates" {
    const maximum = std.math.floatMax(f32);
    const wide_cubic: de_casteljau.Cubic = .{
        .start = .{ .x = -maximum, .y = 0 },
        .control1 = .{ .x = 0, .y = maximum },
        .control2 = .{ .x = 0, .y = -maximum },
        .end = .{ .x = maximum, .y = 0 },
    };
    const result = try maximumControlDistanceSquared(wide_cubic);
    try std.testing.expect(std.math.isFinite(result));
    try std.testing.expect(result > 0);

    inline for (.{ std.math.nan(f32), std.math.inf(f32), -std.math.inf(f32) }) |value| {
        for (0..8) |coordinate_index| {
            var invalid = wide_cubic;
            switch (coordinate_index) {
                0 => invalid.start.x = value,
                1 => invalid.start.y = value,
                2 => invalid.control1.x = value,
                3 => invalid.control1.y = value,
                4 => invalid.control2.x = value,
                5 => invalid.control2.y = value,
                6 => invalid.end.x = value,
                7 => invalid.end.y = value,
                else => unreachable,
            }
            try std.testing.expectError(error.InvalidEmfPlusCubicCoordinate, maximumControlDistanceSquared(invalid));
        }
    }
}
