const std = @import("std");
const t = std.testing;
const solve = @import("linear_preimage.zig").solveWide;
const Linear = @import("parametric_segments.zig").Linear;
const F = @import("fraction.zig").Normalized(1024);
const full = @import("unit_interval.zig").Interval{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 } };
test "extended linear preimage retains denominator beyond target width" {
    const max = std.math.maxInt(u512);
    const line = Linear{ .interval = full, .slope = 65537, .offset = 1 };
    const r = (try solve(line, max / 2, max)).?;
    try t.expect(r.start.denominator > max);
    try t.expectEqual(@as(u1024, 65537) * max, r.start.denominator);
    try t.expectEqual(@as(u1024, 65536) * (max / 2) - max, r.start.numerator);
    try t.expectEqual(.eq, try r.start.order(r.end));
    try t.expect(r.start_included and r.end_included);
}
test "extended linear inverse reverses slopes and preserves open endpoints" {
    const max = std.math.maxInt(u512);
    var line = Linear{ .interval = full, .slope = -65536, .offset = 65536 };
    const r = (try solve(line, 1, max)).?;
    try t.expectEqual(.eq, try r.start.order(.{ .numerator = max - 1, .denominator = max }));
    line.interval.end_included = false;
    try t.expectEqual(@as(?@import("linear_preimage.zig").ExtendedInterval, null), try solve(line, 0, max));
    try t.expect((try solve(line, max, max)) != null);
}
test "extended clipped linear inverse keeps constants and out of range intersections" {
    const max = std.math.maxInt(u512);
    var line = Linear{ .interval = full, .slope = 0, .offset = -2147483648 };
    try t.expect((try solve(line, 0, max)) != null);
    try t.expect((try solve(line, 1, max)) == null);
    line.offset = 2147483647;
    try t.expect((try solve(line, max, max)) != null);
    line.slope = -2147483648;
    const r = (try solve(line, max, max)).?;
    try t.expectEqual(@as(u1024, 0), r.start.numerator);
    try t.expect(r.end.numerator < r.end.denominator);
    try t.expectError(error.InvalidIccCurveCoordinate, solve(line, 1, 0));
}
test "extended fractions use full cross products and interval inclusion" {
    const max = std.math.maxInt(u1024);
    const a = F{ .numerator = max - 1, .denominator = max };
    const b = F{ .numerator = max - 2, .denominator = max - 1 };
    try t.expectEqual(.gt, try a.order(b));
    const half: u1024 = @as(u1024, 1) << 1023;
    try t.expectEqual(.gt, try (F{ .numerator = half, .denominator = half + 1 }).order(.{ .numerator = half - 1, .denominator = half }));
    const I = @import("unit_interval.zig").ExtendedInterval;
    const left = I{ .start = b, .end = a, .end_included = false };
    try t.expect((try left.intersection(.{ .start = a, .end = a })) == null);
    try t.expectError(error.EmptyIccInterval, (I{ .start = a, .end = a, .start_included = false }).validate());
}
test "extended fraction lossy conversion avoids infinity and preserves tiny ratios" {
    inline for (.{ 256, 512, 1024 }) |bits| {
        const G = @import("fraction.zig").Normalized(bits);
        const largest = std.math.maxInt(std.meta.Int(.unsigned, bits));
        try t.expectEqual(@as(f64, 1), try (G{ .numerator = largest, .denominator = largest }).toFloat());
        try t.expect((try (G{ .numerator = 1, .denominator = largest }).toFloat()) > 0);
    }
    const max = std.math.maxInt(u1024);
    try t.expectEqual(@as(f64, 1), try (F{ .numerator = max, .denominator = max }).toFloat());
    try t.expectEqual(@as(f64, 0), try (F{ .numerator = 0, .denominator = max }).toFloat());
    const tiny = try (F{ .numerator = 1, .denominator = max }).toFloat();
    try t.expect(tiny > 0 and std.math.isFinite(tiny));
    try t.expectApproxEqRel(std.math.ldexp(@as(f64, 1), -1024), tiny, 0.000000000000001);
    try t.expectError(error.InvalidIccCurveCoordinate, (F{ .numerator = 1, .denominator = 0 }).toFloat());
}
