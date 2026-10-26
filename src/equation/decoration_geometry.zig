//! Detached accent geometry. Explicit preview primitives, not font shaping.
const std = @import("std");
const m = @import("layout_metrics.zig");
const Curve = @import("delimiter_geometry.zig").Curve;
pub const Kind = enum { acute, grave, dot, ddot, hat, check, bar, vec, dyad, under, arch, tilde, overline, underline, widehat, widetilde };
pub const Parameters = struct { gap: f64, height: f64, thickness: f64 };
pub const Result = struct {
    box: m.Box,
    body: m.Placement,
    curves: [6]Curve = undefined,
    curve_count: usize = 0,
};
pub fn resolve(name: []const u8) ?Kind {
    const entry = @import("commands.zig").lookup(name) orelse return null;
    if (entry.family != .decoration) return null;
    return std.meta.stringToEnum(Kind, entry.canonical);
}
fn curve(result: *Result, points: [7]m.Point, thickness: f64, limits: m.Limits) !void {
    for (points) |point| try m.includeStrokePoint(&result.box, point, thickness, limits);
    if (result.curve_count >= result.curves.len) return error.EquationLayoutLimitExceeded;
    result.curves[result.curve_count] = .{ .points = points, .thickness = thickness };
    result.curve_count += 1;
}
fn line(result: *Result, start: m.Point, end: m.Point, thickness: f64, limits: m.Limits) !void {
    try curve(result, .{ start, start, start, start, start, end, end }, thickness, limits);
}
fn dot(result: *Result, center: m.Point, thickness: f64, limits: m.Limits) !void {
    // A circular centerline of radius t/2 stroked with width t has no hole.
    const radius = thickness / 2;
    const k = radius * 0.5522847498307936;
    try curve(result, .{
        .{ .x = center.x + radius, .y = center.y },
        .{ .x = center.x + radius, .y = center.y - k },
        .{ .x = center.x + k, .y = center.y - radius },
        .{ .x = center.x, .y = center.y - radius },
        .{ .x = center.x - k, .y = center.y - radius },
        .{ .x = center.x - radius, .y = center.y - k },
        .{ .x = center.x - radius, .y = center.y },
    }, thickness, limits);
    try curve(result, .{
        .{ .x = center.x - radius, .y = center.y },
        .{ .x = center.x - radius, .y = center.y + k },
        .{ .x = center.x - k, .y = center.y + radius },
        .{ .x = center.x, .y = center.y + radius },
        .{ .x = center.x + k, .y = center.y + radius },
        .{ .x = center.x + radius, .y = center.y + k },
        .{ .x = center.x + radius, .y = center.y },
    }, thickness, limits);
}
pub fn place(body: m.Box, kind: Kind, p: Parameters, limits: m.Limits) !Result {
    try m.validate(body, limits);
    for ([_]f64{ p.gap, p.height, p.thickness }) |value| try m.dimension(value, limits);
    if (p.thickness == 0) return error.InvalidEquationLayoutMetric;
    const half = p.thickness / 2;
    const width = @max(body.width + 2 * p.thickness, p.thickness * (if (kind == .ddot) @as(f64, 6) else 4));
    const placement: m.Placement = .{ .box = body, .x = (width - body.width) / 2, .baseline = 0 };
    var result: Result = .{ .box = try m.envelope(width, &.{placement}, limits), .body = placement };
    const left = half;
    const right = @max(half, width - half);
    const middle = width / 2;
    const bottom = -body.ascent - p.gap - half;
    const top = bottom - @max(p.height, p.thickness);
    const mid_y = top + (bottom - top) / 2;
    switch (kind) {
        .bar, .overline, .under, .underline => {
            const y = if (kind == .under or kind == .underline) body.descent + p.gap + half else bottom;
            try line(&result, .{ .x = left, .y = y }, .{ .x = right, .y = y }, p.thickness, limits);
        },
        .acute, .grave => try line(&result, .{ .x = width / 3, .y = if (kind == .acute) bottom else top }, .{ .x = width * (2.0 / 3.0), .y = if (kind == .acute) top else bottom }, p.thickness, limits),
        .hat, .widehat, .check => {
            const edge = if (kind == .check) top else bottom;
            const peak = if (kind == .check) bottom else top;
            try line(&result, .{ .x = left, .y = edge }, .{ .x = middle, .y = peak }, p.thickness, limits);
            try line(&result, .{ .x = middle, .y = peak }, .{ .x = right, .y = edge }, p.thickness, limits);
        },
        .vec, .dyad => {
            try line(&result, .{ .x = left, .y = mid_y }, .{ .x = right, .y = mid_y }, p.thickness, limits);
            const head = @min((right - left) / 3, @max(p.height, p.thickness));
            try line(&result, .{ .x = right - head, .y = top }, .{ .x = right, .y = mid_y }, p.thickness, limits);
            try line(&result, .{ .x = right - head, .y = bottom }, .{ .x = right, .y = mid_y }, p.thickness, limits);
            if (kind == .dyad) {
                try line(&result, .{ .x = left + head, .y = top }, .{ .x = left, .y = mid_y }, p.thickness, limits);
                try line(&result, .{ .x = left + head, .y = bottom }, .{ .x = left, .y = mid_y }, p.thickness, limits);
            }
        },
        .dot => try dot(&result, .{ .x = middle, .y = bottom - half }, p.thickness, limits),
        .ddot => {
            try dot(&result, .{ .x = @max(p.thickness, width / 4), .y = bottom - half }, p.thickness, limits);
            try dot(&result, .{ .x = width * 0.75, .y = bottom - half }, p.thickness, limits);
        },
        .arch, .tilde, .widetilde => {
            const y = if (kind == .arch) bottom else mid_y;
            try curve(&result, .{
                .{ .x = left, .y = y },                                    .{ .x = left, .y = top },
                .{ .x = middle, .y = top },                                .{ .x = middle, .y = if (kind == .arch) top else mid_y },
                .{ .x = middle, .y = if (kind == .arch) top else bottom }, .{ .x = right, .y = if (kind == .arch) top else bottom },
                .{ .x = right, .y = y },
            }, p.thickness, limits);
        },
    }
    return result;
}
