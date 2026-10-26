const std = @import("std");
const t = std.testing;
const radical = @import("radical_geometry.zig");
test "equation radical geometry encloses measured body and round stroke without moving baseline" {
    const result = try radical.place(.{ .width = 10, .ascent = 12, .descent = 4 }, .{ .hook_width = 10, .gap = 2, .padding = 2, .thickness = 1 }, .{});
    try t.expectEqual(@as(f64, 25), result.box.width);
    try t.expectEqual(@as(f64, 15), result.box.ascent);
    try t.expectEqual(@as(f64, 4.5), result.box.descent);
    try t.expectEqual(@as(f64, 12.5), result.body.x);
    try t.expectEqual(@as(f64, 0), result.body.baseline);
    try t.expectEqual(@as(f64, -14.5), result.path.points[4].y);
    for (0..128) |i| {
        const scale = @as(f64, @floatFromInt(i + 1)) / 10;
        const r = try radical.place(.{ .width = scale * 0.3, .ascent = scale * 0.6, .descent = scale * 0.2 }, .{ .hook_width = scale * 0.5, .gap = scale * 0.1, .padding = scale * 0.1, .thickness = scale * 0.05 }, .{});
        for (r.path.points) |point| {
            try t.expect(point.x - r.path.thickness / 2 >= 0);
            try t.expect(point.x + r.path.thickness / 2 <= r.box.width);
            try t.expect(-point.y + r.path.thickness / 2 <= r.box.ascent);
            try t.expect(point.y + r.path.thickness / 2 <= r.box.descent);
        }
    }
}
test "equation radical geometry rejects zero strokes invalid metrics and overflow" {
    const body = @import("layout_metrics.zig").Box{ .width = 10, .ascent = 12, .descent = 4 };
    const p = radical.Parameters{ .hook_width = 10, .gap = 2, .padding = 2, .thickness = 1 };
    var bad = p;
    bad.thickness = 0;
    try t.expectError(error.InvalidEquationLayoutMetric, radical.place(body, bad, .{}));
    bad = p;
    bad.gap = std.math.nan(f64);
    try t.expectError(error.InvalidEquationLayoutMetric, radical.place(body, bad, .{}));
    try t.expectError(error.EquationLayoutLimitExceeded, radical.place(body, p, .{ .max_extent = 20 }));
}
