const std = @import("std");
const t = std.testing;
const gamma = @import("gamma_forward.zig");
const para = @import("parametric_forward.zig");
const Curve = @import("parametric_curve.zig").Curve;
test "gamma exponent encoding and exceptional coordinates" {
    try t.expectEqual(@as(f64, 0.25), try gamma.evaluate(512, 0.5));
    try t.expectEqual(@as(f64, 0.5), try gamma.evaluate(128, 0.25));
    try t.expectEqual(@as(f64, 1), try gamma.evaluate(0, 0.5));
    try t.expectError(error.UndefinedIccCurvePower, gamma.evaluate(0, 0));
    for ([_]f64{ -0.1, 1.1, std.math.nan(f64), std.math.inf(f64), -std.math.inf(f64) }) |x|
        try t.expectError(error.InvalidIccCurveCoordinate, gamma.evaluate(256, x));
    for (0..65536) |raw| {
        try t.expectEqual(@as(f64, 1), try gamma.evaluate(@intCast(raw), 1));
        if (raw != 0) try t.expectEqual(@as(f64, 0), try gamma.evaluate(@intCast(raw), 0));
    }
}
test "all parametric branches use 2022 offsets and clipping" {
    const cases = [_]Curve{
        .{ .function = .type0, .values = .{ 65536, 0, 0, 0, 0, 0, 0 } },
        .{ .function = .type1, .values = .{ 65536, 65536, -32768, 0, 0, 0, 0 } },
        .{ .function = .type2, .values = .{ 65536, 65536, -32768, 16384, 0, 0, 0 } },
        .{ .function = .type3, .values = .{ 65536, 65536, 0, 32768, 32768, 0, 0 } },
        .{ .function = .type4, .values = .{ 65536, 65536, 0, 32768, 32768, 16384, 8192 } },
    };
    const expected = [_][3]f64{ .{ 0.25, 0.5, 1 }, .{ 0, 0, 0.5 }, .{ 0.25, 0.25, 0.75 }, .{ 0.125, 0.5, 1 }, .{ 0.25, 0.75, 1 } };
    for (cases, expected) |curve, ys| for ([_]f64{ 0.25, 0.5, 1 }, ys) |x, y| {
        try t.expectEqual(y, try para.evaluate(curve, x));
    };
}
test "parametric undefined points do not contaminate inactive branches" {
    var c: Curve = .{ .function = .type4, .values = .{ 32768, 65536, -65536, 65536, 32768, 0, 0 } };
    try t.expectEqual(@as(f64, 0.25), try para.evaluate(c, 0.25));
    try t.expectError(error.UndefinedIccCurvePower, para.evaluate(c, 0.5));
    c.values[0] = 131072; // Negative base with integral exponent is real.
    try t.expectEqual(@as(f64, 0.25), try para.evaluate(c, 0.5));
    c.function = .type1;
    c.values[1] = 0;
    try t.expectError(error.UndefinedIccCurveThreshold, para.evaluate(c, 0.5));
    c = .{ .function = .type0, .values = .{ -65536, 0, 0, 0, 0, 0, 0 } };
    try t.expectError(error.UndefinedIccCurvePower, para.evaluate(c, 0));
    try t.expectEqual(@as(f64, 1), try para.evaluate(c, 0.5));
    c.values[0] = std.math.minInt(i32);
    try t.expectEqual(@as(f64, 1), try para.evaluate(c, 0.5));
}
test "rounded threshold must not select a negative square root" {
    const c: Curve = .{ .function = .type1, .values = .{ 32768, 49, -1, 0, 0, 0, 0 } };
    // The represented x is slightly below the exact rational 1/49.
    try t.expectEqual(@as(f64, 0), try para.evaluate(c, 1.0 / 49.0));
}
test "subnormal affine sign and recoverable square root survive scaling" {
    var c: Curve = .{ .function = .type3, .values = .{ 32768, -1, 0, 0, 0, 0, 0 } };
    const x: f64 = @bitCast(@as(u64, 1));
    try t.expectError(error.UndefinedIccCurvePower, para.evaluate(c, x));
    c.values[1] = 1;
    try t.expectEqual(std.math.pow(f64, 2, -545), try para.evaluate(c, x));
}
