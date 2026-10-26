//! Explicit preview paths, not a recovered Hancom font outline.
const m = @import("layout_metrics.zig");
const Curve = @import("delimiter_geometry.zig").Curve;
pub const Kind = enum { int, oint, dint, tint, odint, otint };
pub const Parameters = struct { width: f64, height: f64, gap: f64, thickness: f64 };
pub const Result = struct { box: m.Box, curves: [5]Curve = undefined, curve_count: usize = 0 };
pub fn resolve(name: []const u8) ?Kind {
    const command = @import("commands.zig").lookup(name) orelse return null;
    if (command.family != .integral) return null;
    return @import("std").meta.stringToEnum(Kind, command.canonical);
}
fn append(result: *Result, points: [7]m.Point, thickness: f64, limits: m.Limits) !void {
    for (points) |point| try m.includeStrokePoint(&result.box, point, thickness, limits);
    if (result.curve_count == result.curves.len) return error.EquationLayoutLimitExceeded;
    result.curves[result.curve_count] = .{ .points = points, .thickness = thickness };
    result.curve_count += 1;
}
pub fn place(kind: Kind, p: Parameters, limits: m.Limits) !Result {
    for ([_]f64{ p.width, p.height, p.gap, p.thickness }) |value| try m.dimension(value, limits);
    if (p.width == 0 or p.height == 0 or p.thickness == 0) return error.InvalidEquationLayoutMetric;
    const count: usize = switch (kind) {
        .int, .oint => 1,
        .dint, .odint => 2,
        .tint, .otint => 3,
    };
    var result: Result = .{ .box = .{ .width = 0, .ascent = 0, .descent = 0 } };
    const half = p.thickness / 2;
    const top = -p.height * 0.75;
    const bottom = p.height * 0.25;
    for (0..count) |index| {
        const left = half + @as(f64, @floatFromInt(index)) * (p.width + p.gap);
        const center = left + p.width / 2;
        try append(&result, .{
            .{ .x = left + p.width, .y = top + p.height * 0.08 },
            .{ .x = center, .y = top },
            .{ .x = center, .y = top },
            .{ .x = center, .y = (top + bottom) / 2 },
            .{ .x = center, .y = bottom },
            .{ .x = center, .y = bottom },
            .{ .x = left, .y = bottom - p.height * 0.08 },
        }, p.thickness, limits);
    }
    if (kind == .oint or kind == .odint or kind == .otint) {
        const span = @as(f64, @floatFromInt(count)) * p.width + @as(f64, @floatFromInt(count - 1)) * p.gap;
        const x = half + span / 2;
        const y = (top + bottom) / 2;
        const ry = p.height * 0.13;
        const k: f64 = 0.5522847498307936;
        for ([_]f64{ -1, 1 }) |direction| try append(&result, .{
            .{ .x = half + span, .y = y },
            .{ .x = half + span, .y = y + direction * ry * k },
            .{ .x = half + span * (1 + k) / 2, .y = y + direction * ry },
            .{ .x = x, .y = y + direction * ry },
            .{ .x = half + span * (1 - k) / 2, .y = y + direction * ry },
            .{ .x = half, .y = y + direction * ry * k },
            .{ .x = half, .y = y },
        }, p.thickness, limits);
    }
    result.box.width += p.gap;
    try m.validate(result.box, limits);
    return result;
}
