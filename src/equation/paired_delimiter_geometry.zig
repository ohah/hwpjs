//! Independent visible ends around one measured body; no source or fonts.
const m = @import("layout_metrics.zig");
const d = @import("delimiter_geometry.zig");
const tokens = @import("delimiter_tokens.zig");
const std = @import("std");
pub const Result = struct {
    box: m.Box,
    body: m.Placement,
    rectangles: [6]m.Rectangle = undefined,
    rectangle_count: usize = 0,
    curves: [4]d.Curve = undefined,
    curve_count: usize = 0,
};
fn width(side: tokens.Side, p: d.Parameters) f64 {
    return switch (side.shape) {
        .hidden => 0,
        .bars => p.thickness,
        else => p.width + p.thickness,
    };
}
fn appendSide(result: *Result, body: m.Box, side: tokens.Side, x: f64, p: d.Parameters, limits: m.Limits) !void {
    const curve_start = result.curve_count;
    const rect_start = result.rectangle_count;
    const half = p.thickness / 2;
    const side_width = width(side, p);
    switch (side.shape) {
        .hidden => return,
        .parentheses, .brackets, .bars => {
            const kind: d.Kind = switch (side.shape) {
                .parentheses => .parentheses,
                .brackets => .brackets,
                else => .bars,
            };
            // Only the left primitive template is consumed. Do not reject a
            // valid single visible end because the unused full pair is wider.
            const original = try d.place(.{ .width = 0, .ascent = body.ascent, .descent = body.descent }, kind, p, .{ .max_extent = std.math.floatMax(f64) });
            if (side.shape == .parentheses) {
                result.curves[result.curve_count] = original.curves[0];
                result.curve_count += 1;
            } else {
                const indices: []const usize = if (side.shape == .brackets) &.{ 0, 2, 3 } else &.{0};
                for (indices) |index| {
                    result.rectangles[result.rectangle_count] = original.rectangles[index];
                    result.rectangle_count += 1;
                }
            }
        },
        .double_bars => {
            for ([_]f64{ 0, p.width }) |position| {
                result.rectangles[result.rectangle_count] = .{ .x = position, .y = -body.ascent - half, .width = p.thickness, .height = body.ascent + body.descent + p.thickness };
                result.rectangle_count += 1;
            }
        },
        .angles, .braces => {
            const top = -body.ascent;
            const bottom = body.descent;
            const height = body.ascent + body.descent;
            const middle = (top + bottom) / 2;
            const outer = half + p.width;
            const inner = half + p.width / 2;
            const points: [7]m.Point = if (side.shape == .angles) .{
                .{ .x = outer, .y = top },   .{ .x = outer, .y = top },    .{ .x = half, .y = middle },  .{ .x = half, .y = middle },
                .{ .x = half, .y = middle }, .{ .x = outer, .y = bottom }, .{ .x = outer, .y = bottom },
            } else .{
                .{ .x = outer, .y = top },    .{ .x = inner, .y = top },    .{ .x = inner, .y = top },   .{ .x = inner, .y = top + height / 4 },
                .{ .x = inner, .y = middle }, .{ .x = inner, .y = middle }, .{ .x = half, .y = middle },
            };
            result.curves[result.curve_count] = .{ .points = points, .thickness = p.thickness };
            result.curve_count += 1;
            if (side.shape == .braces) {
                var lower = points;
                for (&lower, 0..) |*point, index| {
                    point.* = points[6 - index];
                    point.y = top + bottom - point.y;
                }
                result.curves[result.curve_count] = .{ .points = lower, .thickness = p.thickness };
                result.curve_count += 1;
            }
        },
    }
    for (result.curves[curve_start..result.curve_count]) |*curve| for (&curve.points) |*point| {
        // The mirrored boundary center is exactly half a stroke from origin;
        // subtraction can round it below half, making a negative stroke edge.
        point.x = x + if (side.mirror) @max(half, side_width - point.x) else point.x;
        try m.includeStrokePoint(&result.box, point.*, p.thickness, limits);
    };
    for (result.rectangles[rect_start..result.rectangle_count]) |*rect| {
        rect.x = x + if (side.mirror) side_width - (rect.x + rect.width) else rect.x;
        try m.includeRectangle(&result.box, rect.*, limits);
    }
}
pub fn place(body: m.Box, left: tokens.Side, right: tokens.Side, p: d.Parameters, limits: m.Limits) !Result {
    try m.validate(body, limits);
    for ([_]f64{ p.width, p.gap, p.thickness }) |value| try m.dimension(value, limits);
    if (p.thickness == 0 or p.width == 0) return error.InvalidEquationLayoutMetric;
    const body_x = width(left, p) + if (left.shape == .hidden) @as(f64, 0) else p.gap;
    const right_x = body_x + body.width + if (right.shape == .hidden) @as(f64, 0) else p.gap;
    const placement: m.Placement = .{ .x = body_x, .baseline = 0, .box = body };
    var result: Result = .{ .box = try m.envelope(right_x + width(right, p), &.{placement}, limits), .body = placement };
    try appendSide(&result, body, left, 0, p, limits);
    try appendSide(&result, body, right, right_x, p, limits);
    return result;
}
