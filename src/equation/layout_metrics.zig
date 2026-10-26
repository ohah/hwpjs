//! Unit-neutral measured geometry. No fonts, containers or painting.
const std = @import("std");
pub const Box = struct { width: f64, ascent: f64, descent: f64 };
pub const Placement = struct { box: Box, x: f64, baseline: f64 };
pub const Rectangle = struct { x: f64, y: f64, width: f64, height: f64 };
pub const Point = struct { x: f64, y: f64 };
pub const Limits = struct { max_extent: f64 = 1_000_000 };
pub fn includeStrokePoint(box: *Box, point: Point, thickness: f64, limits: Limits) !void {
    try dimension(thickness, limits);
    const half = thickness / 2;
    try includeRectangle(box, .{ .x = point.x - half, .y = point.y - half, .width = thickness, .height = thickness }, limits);
    // Preserve the exact arithmetic used by Canvas preflight as well.
    box.width = @max(box.width, point.x + half);
    box.ascent = @max(box.ascent, -(point.y - half));
    box.descent = @max(box.descent, point.y + half);
    try validate(box.*, limits);
}
pub fn validateLimits(limits: Limits) !void {
    if (!std.math.isFinite(limits.max_extent) or limits.max_extent <= 0) return error.InvalidEquationLayoutLimit;
}
pub fn dimension(value: f64, limits: Limits) !void {
    try validateLimits(limits);
    if (!std.math.isFinite(value) or value < 0) return error.InvalidEquationLayoutMetric;
    if (value > limits.max_extent) return error.EquationLayoutLimitExceeded;
}
pub fn validate(box: Box, limits: Limits) !void {
    try dimension(box.width, limits);
    try dimension(box.ascent, limits);
    try dimension(box.descent, limits);
    try dimension(box.ascent + box.descent, limits);
}
pub fn includeRectangle(box: *Box, rect: Rectangle, limits: Limits) !void {
    for ([_]f64{ rect.x, rect.width, rect.height, @abs(rect.y) }) |value| try dimension(value, limits);
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    try dimension(right, limits);
    try dimension(@abs(bottom), limits);
    box.width = @max(box.width, right);
    box.ascent = @max(box.ascent, -rect.y);
    box.descent = @max(box.descent, bottom);
    try validate(box.*, limits);
}
pub fn envelope(width: f64, children: []const Placement, limits: Limits) !Box {
    try dimension(width, limits);
    var result: Box = .{ .width = width, .ascent = 0, .descent = 0 };
    for (children) |child| {
        try validate(child.box, limits);
        try dimension(child.x, limits);
        if (!std.math.isFinite(child.baseline)) return error.InvalidEquationLayoutMetric;
        try dimension(@abs(child.baseline), limits);
        const right = child.x + child.box.width;
        try dimension(right, limits);
        if (right > width) return error.InvalidEquationPlacement;
        result.ascent = @max(result.ascent, child.box.ascent - child.baseline);
        result.descent = @max(result.descent, child.baseline + child.box.descent);
    }
    try validate(result, limits);
    return result;
}
