const std = @import("std");
const t = std.testing;
const g = @import("decoration_geometry.zig");
const m = @import("layout_metrics.zig");
test "equation decoration geometry resolves only registered decoration commands" {
    for (@import("commands.zig").groups) |group| {
        if (group.family != .decoration) continue;
        for (group.names) |name| try t.expect(g.resolve(name) != null);
    }
    try t.expectEqual(g.Kind.hat, g.resolve("HAT").?);
    try t.expect(g.resolve("hatter") == null);
    try t.expect(g.resolve("sqrt") == null);
}
test "equation decoration geometry encloses all strokes and body for every kind and decimal size" {
    for (0..128) |i| {
        const size = @as(f64, @floatFromInt(i + 1)) / 7.0;
        const body: m.Box = .{ .width = if (i == 0) 0 else size * 3.17, .ascent = size * 0.71, .descent = size * 0.23 };
        inline for (std.meta.tags(g.Kind)) |kind| {
            const result = try g.place(body, kind, .{ .gap = size * 0.13, .height = size * 0.27, .thickness = size * 0.07 }, .{});
            try t.expect(result.curve_count > 0 and result.curve_count <= result.curves.len);
            try t.expectEqual(body, result.body.box);
            try t.expectEqual(@as(f64, 0), result.body.baseline);
            try t.expect(result.body.x >= 0);
            try t.expect(result.body.x + body.width <= result.box.width);
            try t.expect(body.ascent <= result.box.ascent and body.descent <= result.box.descent);
            for (result.curves[0..result.curve_count]) |curve| for (curve.points) |point| {
                const half = curve.thickness / 2;
                try t.expect(point.x - half >= 0);
                try t.expect(point.x + half <= result.box.width);
                try t.expect(point.y - half >= -result.box.ascent);
                try t.expect(point.y + half <= result.box.descent);
            };
        }
    }
}
test "equation decoration geometry separates underline and upper rules and draws two complete dots" {
    const body: m.Box = .{ .width = 20, .ascent = 12, .descent = 3 };
    const p: g.Parameters = .{ .gap = 2, .height = 4, .thickness = 2 };
    const upper = try g.place(body, .bar, p, .{});
    const lower = try g.place(body, .under, p, .{});
    try t.expectEqual(@as(f64, 16), upper.box.ascent);
    try t.expectEqual(@as(f64, 7), lower.box.descent);
    try t.expectEqual(@as(f64, -15), upper.curves[0].points[0].y);
    try t.expectEqual(@as(f64, 6), lower.curves[0].points[0].y);
    const dots = try g.place(body, .ddot, p, .{});
    try t.expectEqual(@as(usize, 4), dots.curve_count);
    try t.expectEqual(dots.curves[0].points[6], dots.curves[1].points[0]);
    try t.expectEqual(dots.curves[1].points[6], dots.curves[0].points[0]);
    try t.expectEqual(dots.curves[2].points[6], dots.curves[3].points[0]);
    try t.expectEqual(dots.curves[3].points[6], dots.curves[2].points[0]);
    try t.expect(dots.curves[1].points[0].x < dots.curves[2].points[3].x);
}
test "equation decoration geometry rejects nonfinite zero stroke and extent overflow" {
    const body: m.Box = .{ .width = 20, .ascent = 12, .descent = 3 };
    try t.expectError(error.InvalidEquationLayoutMetric, g.place(body, .hat, .{ .gap = 1, .height = 4, .thickness = 0 }, .{}));
    try t.expectError(error.InvalidEquationLayoutMetric, g.place(body, .dot, .{ .gap = std.math.nan(f64), .height = 4, .thickness = 1 }, .{}));
    try t.expectError(error.InvalidEquationLayoutMetric, g.place(body, .vec, .{ .gap = 1, .height = -1, .thickness = 1 }, .{}));
    try t.expectError(error.EquationLayoutLimitExceeded, g.place(body, .arch, .{ .gap = 1, .height = 4, .thickness = 1 }, .{ .max_extent = 20 }));
    try t.expectError(error.InvalidEquationLayoutLimit, g.place(body, .bar, .{ .gap = 1, .height = 4, .thickness = 1 }, .{ .max_extent = 0 }));
    inline for (.{ "gap", "height", "thickness" }) |field| {
        for ([_]f64{ std.math.inf(f64), std.math.nan(f64), -1 }) |invalid| {
            var p: g.Parameters = .{ .gap = 1, .height = 4, .thickness = 1 };
            @field(p, field) = invalid;
            try t.expectError(error.InvalidEquationLayoutMetric, g.place(body, .dot, p, .{}));
        }
    }
    inline for (std.meta.tags(g.Kind)) |kind| {
        const zero = try g.place(.{ .width = 0, .ascent = 0, .descent = 0 }, kind, .{ .gap = 0, .height = 0, .thickness = 0.3 }, .{});
        try t.expect(zero.box.width > 0);
        try t.expect(zero.curve_count > 0);
    }
}
