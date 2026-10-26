const std = @import("std");
const t = std.testing;
const d = @import("delimiter_geometry.zig");

test "equation delimiters enclose both strokes and body across decimal sizes" {
    for (1..129) |index| {
        const size = @as(f64, @floatFromInt(index)) / 10;
        for ([_]d.Kind{ .parentheses, .brackets, .bars }) |kind| {
            const result = try d.place(.{ .width = size * 3, .ascent = size, .descent = size / 3 }, kind, .{ .width = size * 0.4, .gap = size * 0.15, .thickness = size * 0.05 }, .{});
            try t.expect(result.body.x > 0);
            try t.expect(result.body.x + result.body.box.width <= result.box.width);
            try t.expectEqual(@as(usize, if (kind == .parentheses) 2 else 0), result.curve_count);
            try t.expectEqual(@as(usize, switch (kind) {
                .parentheses => 0,
                .brackets => 6,
                .bars => 2,
            }), result.rectangle_count);
            for (result.curves[0..result.curve_count]) |curve| for (curve.points) |point| {
                const half = curve.thickness / 2;
                try t.expect(point.x - half >= 0);
                try t.expect(point.x + half <= result.box.width);
                try t.expect(point.y - half >= -result.box.ascent);
                try t.expect(point.y + half <= result.box.descent);
            };
            for (result.rectangles[0..result.rectangle_count]) |rect| {
                try t.expect(rect.x >= 0 and rect.x + rect.width <= result.box.width);
                try t.expect(rect.y >= -result.box.ascent and rect.y + rect.height <= result.box.descent);
            }
        }
    }
}

test "equation delimiters refuse invalid strokes metrics and exceeded extents" {
    const body: @import("layout_metrics.zig").Box = .{ .width = 3, .ascent = 2, .descent = 1 };
    const params: d.Parameters = .{ .width = 0.4, .gap = 0.15, .thickness = 0.05 };
    var bad = params;
    bad.thickness = 0;
    try t.expectError(error.InvalidEquationLayoutMetric, d.place(body, .parentheses, bad, .{}));
    bad = params;
    bad.gap = std.math.nan(f64);
    try t.expectError(error.InvalidEquationLayoutMetric, d.place(body, .bars, bad, .{}));
    try t.expectError(error.EquationLayoutLimitExceeded, d.place(body, .brackets, params, .{ .max_extent = 3 }));
}
