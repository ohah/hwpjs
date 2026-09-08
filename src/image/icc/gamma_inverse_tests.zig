const std = @import("std");
const t = std.testing;
const inverse = @import("gamma_inverse.zig");
test "gamma inverse exact dyadic examples and endpoints" {
    try t.expectEqual(@as(f64, 0.5), try inverse.evaluate(512, 0.25));
    try t.expectEqual(@as(f64, 0.25), try inverse.evaluate(128, 0.5));
    try t.expectEqual(@as(f64, 0x1p-256), try inverse.evaluate(1, 0.5));
    try t.expectEqual(@as(f64, 0), try inverse.evaluate(1, 0x1p-5));
    for (1..65536) |g| {
        try t.expectEqual(@as(f64, 0), try inverse.evaluate(@intCast(g), 0));
        try t.expectEqual(@as(f64, 1), try inverse.evaluate(@intCast(g), 1));
    }
}
test "gamma inverse identity preserves subnormal and adjacent endpoints" {
    for ([_]f64{ 0, 0x1p-1074, 0x1p-1022, 0.5, 0x1.fffffffffffffp-1, 1 }) |y| {
        try t.expectEqual(@as(u64, @bitCast(y)), @as(u64, @bitCast(try inverse.evaluate(256, y))));
    }
    try t.expectEqual(@as(f64, 0x1p-537), try inverse.evaluate(512, 0x1p-1074));
    try t.expectEqual(@as(f64, 0x1p-1074), try inverse.evaluate(128, 0x1p-537));
}
test "gamma inverse rejects zero exponent and invalid coordinates" {
    for ([_]f64{ 0, 0.5, 1 }) |y| try t.expectError(error.NonInvertibleIccGamma, inverse.evaluate(0, y));
    for ([_]f64{ std.math.nan(f64), std.math.inf(f64), -std.math.inf(f64), -0x1p-1074, 1.0000000000000002 }) |y| {
        for ([_]u16{ 0, 1, 256, 65535 }) |g| try t.expectError(error.InvalidIccCurveCoordinate, inverse.evaluate(g, y));
    }
}
