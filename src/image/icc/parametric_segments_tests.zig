const std = @import("std");
const t = std.testing;
const segments = @import("parametric_segments.zig");
const Interval = segments.Interval;
const Fraction = @import("fraction.zig").Fraction;
fn frac(n: u64, d: u64) Fraction {
    return .{ .numerator = n, .denominator = d };
}
test "unit intervals preserve open endpoints singleton and full u64 comparisons" {
    for ([_]bool{ false, true }) |start_included| for ([_]bool{ false, true }) |end_included| {
        const interval = Interval{ .start = frac(0, 1), .end = frac(1, 1), .start_included = start_included, .end_included = end_included };
        try t.expectEqual(start_included, try interval.contains(frac(0, 1)));
        try t.expect(try interval.contains(frac(1, 2)));
        try t.expectEqual(end_included, try interval.contains(frac(1, 1)));
    };
    const m = std.math.maxInt(u64);
    const i = Interval{ .start = frac(m - 1, m), .end = frac(1, 1), .end_included = false };
    try t.expect(try i.contains(frac(m - 1, m)));
    try t.expect(!(try i.contains(frac(1, 1))));
    const singleton = Interval{ .start = frac(1, 2), .end = frac(2, 4) };
    try t.expect(try singleton.contains(frac(3, 6)));
    try t.expect(!(try singleton.contains(frac(1, 3))));
    var empty = singleton;
    empty.start_included = false;
    try t.expectError(error.EmptyIccInterval, empty.validate());
    try t.expectError(error.InvalidIccIntervalOrder, (Interval{ .start = frac(1, 1), .end = frac(0, 1) }).validate());
    try t.expectError(error.InvalidIccCurveCoordinate, i.contains(frac(0, 0)));
}
test "parametric segments preserve half-open branch and both offsets" {
    const p = try segments.assemble(.{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, -65536 } });
    try t.expectEqual(@as(i32, -65536), p.linear.?.offset);
    try t.expectEqual(@as(i32, 65536), p.power.?.offset);
    try t.expect(!(try p.linear.?.interval.contains(frac(1, 2))));
    try t.expect(try p.power.?.interval.contains(frac(1, 2)));
    for (0..101) |n| {
        const x = frac(n, 100);
        try t.expect((try p.linear.?.interval.contains(x)) != (try p.power.?.interval.contains(x)));
    }
}
test "parametric segments retain terminal singleton and omit inactive branches" {
    var c = @import("parametric_curve.zig").Curve{ .function = .type3, .values = .{ 65536, 65536, 0, 65536, 65536, 0, 0 } };
    const terminal = try segments.assemble(c);
    try t.expect(try terminal.power.?.interval.contains(frac(1, 1)));
    try t.expect(!(try terminal.linear.?.interval.contains(frac(1, 1))));
    c.values[4] = 65537;
    const lower = try segments.assemble(c);
    try t.expect(lower.power == null);
    try t.expect(try lower.linear.?.interval.contains(frac(1, 1)));
    c.values[4] = 0;
    try t.expect((try segments.assemble(c)).linear == null);
    c.values[0] = -65536;
    try t.expectError(error.UndefinedIccCurvePower, segments.assemble(c));
}
