//! Stretchable preview radical; dimensions are supplied, never font constants.
const m = @import("layout_metrics.zig");
pub const Parameters = struct { hook_width: f64, gap: f64, padding: f64, thickness: f64 };
pub const Point = m.Point;
pub const Path = struct { points: [5]Point, thickness: f64 };
pub const Result = struct { box: m.Box, body: m.Placement, path: Path };
pub fn place(body: m.Box, p: Parameters, limits: m.Limits) !Result {
    try m.validate(body, limits);
    for ([_]f64{ p.hook_width, p.gap, p.padding, p.thickness }) |value| try m.dimension(value, limits);
    if (p.hook_width == 0 or p.thickness == 0) return error.InvalidEquationLayoutMetric;
    const half = p.thickness / 2;
    const body_x = half + p.hook_width + p.gap;
    const bar_end = body_x + body.width + p.padding;
    const width = bar_end + half;
    try m.dimension(width, limits);
    const top = -body.ascent - p.gap - half;
    const bottom = body.descent;
    const middle = (top + bottom) / 2;
    const points: [5]Point = .{
        .{ .x = half, .y = middle },
        .{ .x = half + p.hook_width / 4, .y = middle - p.gap / 2 },
        .{ .x = half + p.hook_width / 2, .y = bottom },
        .{ .x = half + p.hook_width, .y = top },
        .{ .x = bar_end, .y = top },
    };
    var box = try m.envelope(width, &.{.{ .box = body, .x = body_x, .baseline = 0 }}, limits);
    // Round joins and butt caps fit inside each point's half-stroke envelope.
    for (points) |point| {
        try m.dimension(point.x, limits);
        try m.dimension(@abs(point.y), limits);
        box.ascent = @max(box.ascent, -point.y + half);
        box.descent = @max(box.descent, point.y + half);
    }
    try m.validate(box, limits);
    return .{ .box = box, .body = .{ .box = body, .x = body_x, .baseline = 0 }, .path = .{ .points = points, .thickness = p.thickness } };
}
