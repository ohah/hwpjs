const std = @import("std");
const t = std.testing;
const forward = @import("trc_forward.zig");
const trc = @import("trc_tag.zig");
test "TRC identity preserves exact unreduced and u64 boundary fractions" {
    const c: trc.Curve = .{ .curve_type = .identity };
    for ([_]forward.Fraction{ .{ .numerator = 2, .denominator = 6 }, .{ .numerator = std.math.maxInt(u64) - 1, .denominator = std.math.maxInt(u64) }, .{ .numerator = 0, .denominator = 1 } }) |x| {
        try t.expectEqual(x, (try forward.evaluate(c, x)).exact);
    }
    try t.expectError(error.InvalidIccCurveCoordinate, forward.evaluate(c, .{ .numerator = 0, .denominator = 0 }));
    try t.expectError(error.InvalidIccCurveCoordinate, forward.evaluate(c, .{ .numerator = 2, .denominator = 1 }));
}
test "TRC dispatch distinguishes exact samples from approximate analytic output" {
    const x: forward.Fraction = .{ .numerator = 1, .denominator = 2 };
    const samples: trc.Curve = .{ .curve_type = .{ .samples = .{ .data = &.{ 0, 0, 255, 255 } } } };
    const result = (try forward.evaluate(samples, x)).exact;
    try t.expectEqual(result.numerator * 2, result.denominator);
    try t.expectEqual(@as(f64, 0.25), (try forward.evaluate(.{ .curve_type = .{ .gamma = 512 } }, x)).approximate);
    try t.expectEqual(@as(f64, 0.25), (try forward.evaluate(.{ .parametric = .{ .function = .type0, .values = .{ 131072, 0, 0, 0, 0, 0, 0 } } }, x)).approximate);
    try t.expectError(error.IccFractionLimitExceeded, forward.evaluate(samples, .{ .numerator = 1, .denominator = std.math.maxInt(u64) }));
}
test "TRC parsing and evaluation preserve semantic deferral" {
    const data = "curv" ++ "\x00" ** 8;
    for ([_][4]u8{ "rTRC".*, "gTRC".*, "bTRC".*, "kTRC".* }) |name| {
        const parsed = (try trc.parse(name, data, .v4_2022)).?;
        _ = try forward.evaluate(parsed.curve, .{ .numerator = 1, .denominator = 3 });
        try t.expect(parsed.semantics_deferred);
    }
}
