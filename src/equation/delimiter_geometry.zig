//! Stretchable delimiters around an already measured body, not font shaping.
const m = @import("layout_metrics.zig");
pub const Kind = enum { parentheses, brackets, bars };
pub const Parameters = struct { width: f64, gap: f64, thickness: f64 };
pub const Curve = struct { points: [7]m.Point, thickness: f64 };
pub const Result = struct {
    box: m.Box,
    body: m.Placement,
    rectangles: [6]m.Rectangle = undefined,
    rectangle_count: usize = 0,
    curves: [2]Curve = undefined,
    curve_count: usize = 0,
};
pub fn place(body: m.Box, kind: Kind, p: Parameters, limits: m.Limits) !Result {
    try m.validate(body, limits);
    for ([_]f64{ p.width, p.gap, p.thickness }) |value| try m.dimension(value, limits);
    if (p.thickness == 0 or (kind != .bars and p.width == 0)) return error.InvalidEquationLayoutMetric;
    const gutter = if (kind == .bars) 0 else p.width;
    const half = p.thickness / 2;
    const body_x = p.thickness + gutter + p.gap;
    const right = body_x + body.width + p.gap;
    const width = right + gutter + p.thickness;
    const top = -body.ascent;
    const bottom = body.descent;
    const height = body.ascent + body.descent;
    const placement: m.Placement = .{ .box = body, .x = body_x, .baseline = 0 };
    var result: Result = .{ .box = try m.envelope(width, &.{placement}, limits), .body = placement };
    if (kind == .parentheses) {
        const middle = (top + bottom) / 2;
        const k: f64 = 0.5522847498307936;
        const left_points: [7]m.Point = .{
            .{ .x = half + gutter, .y = top },
            .{ .x = half + gutter * (1 - k), .y = top },
            .{ .x = half, .y = middle - height / 2 * k },
            .{ .x = half, .y = middle },
            .{ .x = half, .y = middle + height / 2 * k },
            .{ .x = half + gutter * (1 - k), .y = bottom },
            .{ .x = half + gutter, .y = bottom },
        };
        result.curves[0] = .{ .points = left_points, .thickness = p.thickness };
        var right_points = left_points;
        for (&right_points) |*point| point.x = right + gutter + p.thickness - point.x;
        result.curves[1] = .{ .points = right_points, .thickness = p.thickness };
        result.curve_count = 2;
    } else {
        result.rectangles[0] = .{ .x = 0, .y = top - half, .width = p.thickness, .height = height + p.thickness };
        result.rectangles[1] = .{ .x = right + gutter, .y = top - half, .width = p.thickness, .height = height + p.thickness };
        result.rectangle_count = 2;
        if (kind == .brackets) {
            result.rectangles[2] = .{ .x = 0, .y = top - half, .width = gutter + p.thickness, .height = p.thickness };
            result.rectangles[3] = .{ .x = 0, .y = bottom - half, .width = gutter + p.thickness, .height = p.thickness };
            result.rectangles[4] = .{ .x = right, .y = top - half, .width = gutter + p.thickness, .height = p.thickness };
            result.rectangles[5] = .{ .x = right, .y = bottom - half, .width = gutter + p.thickness, .height = p.thickness };
            result.rectangle_count = 6;
        }
    }
    for (result.rectangles[0..result.rectangle_count]) |rect| {
        try m.includeRectangle(&result.box, rect, limits);
    }
    for (result.curves[0..result.curve_count]) |curve| for (curve.points) |point| {
        try m.includeStrokePoint(&result.box, point, p.thickness, limits);
    };
    try m.validate(result.box, limits);
    return result;
}
