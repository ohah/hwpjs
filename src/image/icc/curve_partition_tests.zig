const std = @import("std");
const t = std.testing;
const Fraction = @import("fraction.zig").Fraction;
const Interval = @import("unit_interval.zig").Interval;
const split = @import("interval_split.zig").split;
const linear = @import("linear_clip.zig");
const power = @import("power_partition.zig");
fn f(n: u64, d: u64) Fraction {
    return .{ .numerator = n, .denominator = d };
}
test "exact interval splits conserve membership for all inclusion flags" {
    for ([_]bool{ false, true }) |lo| for ([_]bool{ false, true }) |hi| {
        const interval = Interval{ .start = f(1, 4), .end = f(3, 4), .start_included = lo, .end_included = hi };
        for (0..9) |c| {
            const parts = try split(interval, f(c, 8));
            for (0..17) |n| {
                const x = f(n, 16);
                const l = if (parts.left) |p| try p.contains(x) else false;
                const r = if (parts.right) |p| try p.contains(x) else false;
                try t.expect(!(l and r));
                try t.expectEqual(try interval.contains(x), l or r);
            }
        }
    };
    const m = std.math.maxInt(u64);
    const parts = try split(.{ .start = f(m - 1, m), .end = f(1, 1) }, f(1, 1));
    try t.expect(try parts.left.?.contains(f(m - 1, m)));
    try t.expect(try parts.right.?.contains(f(1, 1)));
    try t.expectError(error.InvalidIccCurveCoordinate, split(.{ .start = f(0, 1), .end = f(1, 1) }, f(0, 0)));
}
test "linear clipping partitions rising falling constant and terminal cuts" {
    const max = std.math.maxInt(u64);
    const wide = try linear.partition(.{ .interval = .{ .start = f(max - 1, max), .end = f(1, 1) }, .slope = std.math.minInt(i32), .offset = std.math.maxInt(i32) });
    try t.expectEqual(@as(usize, 1), wide.count);
    try t.expectEqual(linear.Kind.zero, wide.pieces[0].kind);
    const wide_constant = try linear.partition(.{ .interval = .{ .start = f(max - 1, max), .end = f(1, 1) }, .slope = 0, .offset = 32768 });
    try t.expectEqual(linear.Kind.affine, wide_constant.pieces[0].kind);
    try t.expectEqual(linear.Direction.constant, wide_constant.pieces[0].direction);
    const interval = Interval{ .start = f(0, 1), .end = f(1, 1) };
    const up = try linear.partition(.{ .interval = interval, .slope = 131072, .offset = -32768 });
    try t.expectEqual(@as(usize, 3), up.count);
    try t.expectEqual(linear.Kind.zero, up.pieces[0].kind);
    try t.expectEqual(linear.Direction.increasing, up.pieces[1].direction);
    try t.expectEqual(linear.Kind.one, up.pieces[2].kind);
    try t.expect(!(try up.pieces[0].interval.contains(f(1, 4))));
    try t.expect(try up.pieces[1].interval.contains(f(1, 4)));
    const down = try linear.partition(.{ .interval = interval, .slope = -131072, .offset = 98304 });
    try t.expectEqual(linear.Kind.one, down.pieces[0].kind);
    try t.expectEqual(linear.Direction.decreasing, down.pieces[1].direction);
    try t.expectEqual(linear.Kind.zero, down.pieces[2].kind);
    const constant = try linear.partition(.{ .interval = interval, .slope = 0, .offset = 32768 });
    try t.expectEqual(@as(usize, 1), constant.count);
    try t.expectEqual(linear.Direction.constant, constant.pieces[0].direction);
    const terminal = try linear.partition(.{ .interval = interval, .slope = 65536, .offset = 0 });
    try t.expectEqual(@as(usize, 2), terminal.count);
    try t.expectEqual(linear.Kind.one, terminal.pieces[1].kind);
    try t.expectEqual(.eq, try terminal.pieces[1].interval.start.order(terminal.pieces[1].interval.end));
}
test "power partitions preserve pre-clipping folds and domain errors" {
    var c = @import("parametric_curve.zig").Curve{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 65536, 0 } };
    const folded = try power.partition(c);
    try t.expectEqual(@as(usize, 2), folded.count);
    try t.expectEqual(power.Direction.decreasing, folded.pieces[0].direction);
    try t.expectEqual(power.Direction.increasing, folded.pieces[1].direction);
    // Adding one clips the actual curve to a constant, but must not relabel raw directions.
    try t.expectEqual(@as(i32, 65536), folded.pieces[0].power.offset);
    c.values[0] = 196608;
    const odd = try power.partition(c);
    try t.expectEqual(power.Direction.increasing, odd.pieces[0].direction);
    try t.expectEqual(power.Direction.increasing, odd.pieces[1].direction);
    c.values[0] = -65536;
    try t.expectError(error.UndefinedIccCurvePower, power.partition(c));
}
