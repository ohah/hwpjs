const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const solve = @import("power_preimage.zig").solve;
test "clipped power preimage hides partial sets when a near-start root is undecided" {
    const curve = Curve{ .function = .type3, .values = .{ 131072, 65537, 0, 0, 1, 0, 0 } };
    // The start value is 65537^2/2^64. This target is just above it,
    // by about 2^-160, despite each input being an exact u128 integer.
    const n = @as(u128, 65537) * 65537 << 64;
    const d = std.math.maxInt(u128);
    try std.testing.expect((try solve(128, curve, n, d)) == .undecided);
    const exact = (try solve(512, curve, n, d)).set;
    try std.testing.expectEqual(@as(usize, 0), exact.interval_count);
    try std.testing.expectEqual(@as(usize, 1), exact.point_count);
    try std.testing.expectEqual(.interior, exact.points[0].location);
}
test "clipped power preimage preserves isolated zero and both interior roots" {
    const curve = Curve{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 0, 0 } };
    const zero = (try solve(512, curve, 0, 1)).set;
    try std.testing.expectEqual(@as(usize, 0), zero.interval_count);
    try std.testing.expectEqual(@as(usize, 1), zero.point_count);
    try std.testing.expect(zero.points[0].root == .zero);
    try std.testing.expectEqual(.interior, zero.points[0].location);
    const middle = (try solve(512, curve, 1, 3)).set;
    try std.testing.expectEqual(@as(usize, 0), middle.interval_count);
    try std.testing.expectEqual(@as(usize, 2), middle.point_count);
    try std.testing.expect(!middle.points[0].root.nonzero.negative);
    try std.testing.expect(middle.points[1].root.nonzero.negative);
}
test "clipped power preimage includes flats and their exact equality boundaries" {
    var curve = Curve{ .function = .type4, .values = .{ 131072, 262144, -131072, 0, 0, 0, 0 } };
    const one = (try solve(512, curve, 1, 1)).set;
    try std.testing.expectEqual(@as(usize, 2), one.interval_count);
    try std.testing.expectEqual(@as(usize, 2), one.point_count);
    try std.testing.expect(!one.intervals[0].end_included);
    try std.testing.expect(one.intervals[1].start_included);
    try std.testing.expectEqual(.one, one.intervals[0].end.level_root.level);
    try std.testing.expectEqual(.one, one.intervals[1].start.level_root.level);
    // Do not sort points by base sign and mistake that for affine x order.
    try std.testing.expect(!one.points[0].root.nonzero.negative);
    try std.testing.expect(one.points[1].root.nonzero.negative);
    curve.values[5] = -32768;
    const zero = (try solve(512, curve, 0, 1)).set;
    try std.testing.expectEqual(@as(usize, 2), zero.interval_count);
    try std.testing.expectEqual(@as(usize, 2), zero.point_count);
}
test "clipped power preimage handles constant below range entire inactive and invalid target" {
    var curve = Curve{ .function = .type4, .values = .{ 0, 0, 65536, 0, 0, -131072, 0 } };
    const zero = (try solve(128, curve, 0, 1)).set;
    try std.testing.expectEqual(@as(usize, 1), zero.interval_count);
    try std.testing.expectEqual(@as(usize, 0), zero.point_count);
    try std.testing.expectEqual(@as(u64, 0), zero.intervals[0].start.rational.numerator);
    try std.testing.expectEqual(@as(u64, 1), zero.intervals[0].end.rational.numerator);
    const absent = (try solve(128, curve, 1, 2)).set;
    try std.testing.expectEqual(@as(usize, 0), absent.interval_count + absent.point_count);
    curve.values[5] = -32768;
    try std.testing.expectEqual(@as(usize, 1), (try solve(128, curve, 1, 2)).set.interval_count);
    curve.values[2] = 0;
    try std.testing.expectError(error.UndefinedIccCurvePower, solve(128, curve, 1, 2));
    curve.values = .{ 65536, 65536, 0, 0, 65537, 0, 0 };
    try std.testing.expect((try solve(128, curve, 1, 2)) == .inactive);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, solve(128, curve, 1, 0));
}
