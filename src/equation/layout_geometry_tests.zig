const std = @import("std");
const t = std.testing;
const m = @import("layout_metrics.zig");
const fractions = @import("fraction_geometry.zig");
const scripts = @import("script_geometry.zig");
const rows = @import("row_geometry.zig");
const base: m.Box = .{ .width = 12, .ascent = 8, .descent = 2 };
const sub: m.Box = .{ .width = 4, .ascent = 4, .descent = 1 };
const sup: m.Box = .{ .width = 5, .ascent = 3, .descent = 1 };
const sp: scripts.Parameters = .{ .gap = 1, .superscript_shift = 6, .subscript_shift = 4, .clearance = 3 };
test "equation geometry fractions center measured children around the explicit axis" {
    const n: m.Box = .{ .width = 8, .ascent = 7, .descent = 2 };
    const d: m.Box = .{ .width = 10, .ascent = 5, .descent = 1 };
    const p: fractions.Parameters = .{ .padding = 3, .gap = 2, .rule_thickness = 2, .axis = 4 };
    const fraction = try fractions.place(n, d, p, true, .{});
    try t.expectEqualDeep(m.Box{ .width = 16, .ascent = 16, .descent = 5 }, fraction.box);
    try t.expectEqual(@as(f64, 4), fraction.numerator.x);
    try t.expectEqual(@as(f64, -9), fraction.numerator.baseline);
    try t.expectEqual(@as(f64, 3), fraction.denominator.x);
    try t.expectEqual(@as(f64, 4), fraction.denominator.baseline);
    try t.expectEqual(@as(f64, -4), fraction.rule.?.y);
    const atop = try fractions.place(n, d, p, false, .{});
    try t.expect(atop.rule == null);
    try t.expectEqualDeep(m.Box{ .width = 16, .ascent = 15, .descent = 4 }, atop.box);
}
test "equation geometry scripts place both sides without changing the base baseline" {
    const right = try scripts.place(base, sub, sup, .right, sp, .{});
    const left = try scripts.place(base, sub, sup, .left, sp, .{});
    try t.expectEqualDeep(m.Box{ .width = 18, .ascent = 9, .descent = 5 }, right.box);
    try t.expectEqualDeep(right.box, left.box);
    try t.expectEqual(@as(f64, 13), right.sub.?.x);
    try t.expectEqual(@as(f64, 13), right.sup.?.x);
    try t.expectEqual(@as(f64, 6), left.base.x);
    try t.expectEqual(@as(f64, 1), left.sub.?.x);
    try t.expectEqual(@as(f64, 0), left.sup.?.x);
    try t.expectEqual(@as(f64, 0), left.base.baseline);
    const empty = try scripts.place(base, null, null, .left, sp, .{});
    try t.expectEqualDeep(base, empty.box);
    try t.expectEqual(@as(f64, 0), empty.base.x);
    const crowded = try scripts.place(base, sub, sup, .right, .{ .gap = 1, .superscript_shift = 0, .subscript_shift = 0, .clearance = 3 }, .{});
    try t.expectEqual(@as(f64, 3), (crowded.sub.?.baseline - sub.ascent) - (crowded.sup.?.baseline + sup.descent));
}
test "equation geometry row composition is baseline aligned and associative" {
    const ab = try rows.join(base, sub, .{});
    const abc = try rows.join(ab.box, sup, .{});
    const bc = try rows.join(sub, sup, .{});
    const a_bc = try rows.join(base, bc.box, .{});
    try t.expectEqualDeep(abc.box, a_bc.box);
    try t.expectEqual(@as(f64, 12), ab.second.x);
    try t.expectEqual(@as(f64, 0), ab.second.baseline);
}
test "equation geometry mirrored scripts enclose fractional advance rounding" {
    const measured: m.Box = .{ .width = 0.3, .ascent = 0, .descent = 0 };
    const small: m.Box = .{ .width = 0.1, .ascent = 0, .descent = 0 };
    const p: scripts.Parameters = .{ .gap = 0.2, .superscript_shift = 0, .subscript_shift = 0, .clearance = 0 };
    const left = try scripts.place(measured, small, null, .left, p, .{});
    const right = try scripts.place(measured, small, null, .right, p, .{});
    try t.expect(left.base.x + measured.width <= left.box.width);
    try t.expectEqual(right.box.width, left.box.width);
}
test "equation geometry rejects nonfinite negative overflowing and out of bounds metrics" {
    for ([_]f64{ std.math.nan(f64), std.math.inf(f64), -std.math.inf(f64), -1 }) |bad| {
        try t.expectError(error.InvalidEquationLayoutMetric, rows.join(.{ .width = bad, .ascent = 1, .descent = 1 }, base, .{}));
        try t.expectError(error.InvalidEquationLayoutMetric, scripts.place(base, sub, sup, .left, .{ .gap = bad, .superscript_shift = 1, .subscript_shift = 1, .clearance = 1 }, .{}));
        try t.expectError(error.InvalidEquationLayoutMetric, fractions.place(base, sub, .{ .padding = 0, .gap = 0, .axis = bad, .rule_thickness = 1 }, true, .{}));
    }
    try t.expectError(error.EquationLayoutLimitExceeded, rows.join(base, base, .{ .max_extent = 20 }));
    try t.expectError(error.InvalidEquationLayoutLimit, rows.join(base, sub, .{ .max_extent = 0 }));
    try t.expectError(error.InvalidEquationLayoutLimit, rows.join(base, sub, .{ .max_extent = std.math.inf(f64) }));
    try t.expectError(error.InvalidEquationPlacement, m.envelope(1, &.{.{ .box = sub, .x = 0, .baseline = 0 }}, .{}));
    const huge: m.Box = .{ .width = std.math.floatMax(f64), .ascent = 0, .descent = 0 };
    try t.expectError(error.InvalidEquationLayoutMetric, rows.join(huge, huge, .{ .max_extent = std.math.floatMax(f64) }));
}

test "equation geometry integer half unit oracle checks fraction bounds and rule centers" {
    for (0..128) |index| {
        const nw: i64 = @intCast(index % 13);
        const dw: i64 = @intCast((index * 7) % 11);
        const na: i64 = @intCast(index % 7);
        const nd: i64 = @intCast(index % 3);
        const da: i64 = @intCast((index * 3) % 7);
        const dd: i64 = @intCast((index * 5) % 3);
        const numerator: m.Box = .{ .width = @floatFromInt(nw), .ascent = @floatFromInt(na), .descent = @floatFromInt(nd) };
        const denominator: m.Box = .{ .width = @floatFromInt(dw), .ascent = @floatFromInt(da), .descent = @floatFromInt(dd) };
        for ([_]bool{ false, true }) |draw_rule| {
            const line: i64 = if (draw_rule) 1 else 0;
            const top2 = -6 - line - 4 - 2 * nd;
            const bottom2 = -6 + line + 4 + 2 * da;
            const a2 = @max(@as(i64, 0), @max(2 * na - top2, 2 * da - bottom2));
            const d2 = @max(@as(i64, 0), @max(top2 + 2 * nd, bottom2 + 2 * dd));
            const placed = try fractions.place(numerator, denominator, .{ .padding = 1, .gap = 2, .rule_thickness = 1, .axis = 3 }, draw_rule, .{});
            try t.expectEqual(@as(f64, @floatFromInt(@max(nw, dw) + 2)), placed.box.width);
            try t.expectEqual(@as(f64, @floatFromInt(top2)) / 2, placed.numerator.baseline);
            try t.expectEqual(@as(f64, @floatFromInt(bottom2)) / 2, placed.denominator.baseline);
            try t.expectEqual(@as(f64, @floatFromInt(a2)) / 2, placed.box.ascent);
            try t.expectEqual(@as(f64, @floatFromInt(d2)) / 2, placed.box.descent);
        }
    }
}

test "equation geometry varied decimal script mirrors keep all measured advances enclosed" {
    for (0..256) |index| {
        const measured: m.Box = .{ .width = @as(f64, @floatFromInt(index)) / 10, .ascent = 4, .descent = 1 };
        const small: m.Box = .{ .width = @as(f64, @floatFromInt((index * 7) % 131)) / 10, .ascent = 2, .descent = 1 };
        var p = sp;
        p.gap = @as(f64, @floatFromInt((index * 3) % 17)) / 10;
        const left = try scripts.place(measured, small, sup, .left, p, .{});
        const right = try scripts.place(measured, small, sup, .right, p, .{});
        try t.expectEqualDeep(left.box, right.box);
        for ([_]scripts.Result{ left, right }) |result| {
            try t.expect(result.base.x + result.base.box.width <= result.box.width);
            try t.expect(result.sub.?.x + small.width <= result.box.width);
            try t.expect(result.sup.?.x + sup.width <= result.box.width);
        }
    }
}
