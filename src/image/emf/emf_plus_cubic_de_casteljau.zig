const std = @import("std");
const geometry = @import("emf_plus_geometry.zig");

pub const Cubic = struct {
    start: geometry.PointF,
    control1: geometry.PointF,
    control2: geometry.PointF,
    end: geometry.PointF,
};

pub const Levels = struct {
    first1: geometry.PointF,
    first2: geometry.PointF,
    first3: geometry.PointF,
    second1: geometry.PointF,
    second2: geometry.PointF,
    point: geometry.PointF,
};

pub fn validateParameter(parameter: f32) !void {
    if (!std.math.isFinite(parameter) or parameter < 0 or parameter > 1)
        return error.InvalidEmfPlusCubicParameter;
}

pub fn resolve(cubic: Cubic, parameter: f32) !Levels {
    try validateParameter(parameter);
    const inverse = 1.0 - parameter;
    const first1 = lerp(cubic.start, cubic.control1, inverse, parameter);
    const first2 = lerp(cubic.control1, cubic.control2, inverse, parameter);
    const first3 = lerp(cubic.control2, cubic.end, inverse, parameter);
    const second1 = lerp(first1, first2, inverse, parameter);
    const second2 = lerp(first2, first3, inverse, parameter);
    return .{
        .first1 = first1,
        .first2 = first2,
        .first3 = first3,
        .second1 = second1,
        .second2 = second2,
        .point = lerp(second1, second2, inverse, parameter),
    };
}

fn lerp(start: geometry.PointF, end: geometry.PointF, inverse: f32, parameter: f32) geometry.PointF {
    return .{
        .x = inverse * start.x + parameter * end.x,
        .y = inverse * start.y + parameter * end.y,
    };
}
