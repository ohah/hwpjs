const std = @import("std");
const t = std.testing;
const Curve = @import("parametric_curve.zig").Curve;
const solve = @import("power_preimage.zig").solveWide;
test "extended power preimage retains isolated zero and two full width roots" {
    const max = std.math.maxInt(u512);
    const curve = Curve{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 0, 0 } };
    const zero = (try solve(512, curve, 0, max)).set;
    try t.expectEqual(@as(usize, 0), zero.interval_count);
    try t.expectEqual(@as(usize, 1), zero.point_count);
    try t.expect(zero.points[0].root == .zero);
    const mid = (try solve(1024, curve, max / 2, max)).set;
    try t.expectEqual(@as(usize, 0), mid.interval_count);
    try t.expectEqual(@as(usize, 2), mid.point_count);
    for (mid.points[0..mid.point_count]) |point| {
        try t.expectEqual(.interior, point.location);
        try t.expect(point.root.nonzero.denominator > max);
    }
}
test "extended power preimage keeps saturation intervals and equality boundaries" {
    const max = std.math.maxInt(u512);
    var curve = Curve{ .function = .type4, .values = .{ 131072, 262144, -131072, 0, 0, 0, 0 } };
    const one = (try solve(512, curve, max, max)).set;
    try t.expectEqual(@as(usize, 2), one.interval_count);
    try t.expectEqual(@as(usize, 2), one.point_count);
    try t.expect(!one.intervals[0].end_included);
    try t.expect(one.intervals[1].start_included);
    try t.expect(!one.points[0].root.nonzero.negative);
    try t.expect(one.points[1].root.nonzero.negative);
    curve.values[5] = -32768;
    const zero = (try solve(512, curve, 0, max)).set;
    try t.expectEqual(@as(usize, 2), zero.interval_count);
    try t.expectEqual(@as(usize, 2), zero.point_count);
}
test "extended power preimage hides a near-start uncertain partial result" {
    const curve = Curve{ .function = .type3, .values = .{ 131072, 65537, 0, 0, 1, 0, 0 } };
    const n = @as(u512, 65537) * 65537 << 448;
    const d = std.math.maxInt(u512);
    try t.expect((try solve(128, curve, n, d)) == .undecided);
    const result = (try solve(1024, curve, n, d)).set;
    try t.expectEqual(@as(usize, 0), result.interval_count);
    try t.expectEqual(@as(usize, 1), result.point_count);
    try t.expectEqual(.interior, result.points[0].location);
}
test "extended power preimage separates constant clipped entire empty and inactive" {
    const d = std.math.maxInt(u512) - 1;
    var curve = Curve{ .function = .type4, .values = .{ 0, 0, 65536, 0, 0, -131072, 0 } };
    const below = (try solve(128, curve, 0, d)).set;
    try t.expectEqual(@as(usize, 1), below.interval_count);
    try t.expectEqual(@as(usize, 0), below.point_count);
    curve.values[5] = -32768;
    try t.expectEqual(@as(usize, 1), (try solve(128, curve, d / 2, d)).set.interval_count);
    const empty = (try solve(128, curve, d / 2 + 1, d)).set;
    try t.expectEqual(@as(usize, 0), empty.interval_count + empty.point_count);
    curve.values[2] = 0;
    try t.expectError(error.UndefinedIccCurvePower, solve(128, curve, 0, d));
    curve.values = .{ 65536, 65536, 0, 0, 65537, 0, 0 };
    try t.expect((try solve(128, curve, 1, d)) == .inactive);
    try t.expectError(error.InvalidIccCurveCoordinate, solve(128, curve, 1, 0));
}
