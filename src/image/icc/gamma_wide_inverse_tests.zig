const std = @import("std");
const t = std.testing;
const api = @import("gamma_wide_inverse.zig");
test "wide gamma preserves exact identity and endpoints for every positive raw gamma" {
    const max = std.math.maxInt(u512);
    for (1..65536) |raw| {
        for ([_]api.Target{ .{ .numerator = 0, .denominator = max }, .{ .numerator = max, .denominator = max } }) |target| {
            try t.expectEqualDeep(target, (try api.invert(@intCast(raw), target)).rational);
        }
    }
    const target = api.Target{ .numerator = max - 1, .denominator = max };
    try t.expectEqualDeep(target, (try api.invert(256, target)).rational);
}
test "wide gamma retains radicand and exact reciprocal for every positive gamma" {
    const max = std.math.maxInt(u512);
    const target = api.Target{ .numerator = max - 1, .denominator = max };
    for (1..65536) |raw| {
        if (raw == 256) continue;
        const r = (try api.invert(@intCast(raw), target)).power;
        try r.validate();
        try t.expect(!r.negative);
        try t.expectEqual(target.numerator, r.numerator);
        try t.expectEqual(target.denominator, r.denominator);
        try t.expectEqual(@as(i32, 65536), r.exponent_numerator);
        try t.expectEqual(@as(u32, @intCast(raw)) * 256, r.exponent_denominator);
    }
}
test "wide gamma does not round very small inputs or confuse forward and inverse exponent" {
    const max = std.math.maxInt(u512);
    const r = (try api.invert(1, .{ .numerator = 1, .denominator = max })).power;
    try t.expectEqual(@as(u512, 1), r.numerator);
    try t.expectEqual(max, r.denominator);
    try t.expectEqual(@as(u32, 256), r.exponent_denominator);
    const square_root = (try api.invert(512, .{ .numerator = 1, .denominator = 4 })).power;
    try t.expectEqual(@as(u1024, square_root.numerator) * 4, @as(u1024, square_root.denominator));
    try t.expectEqual(@as(u32, @intCast(square_root.exponent_numerator)) * 2, square_root.exponent_denominator);
}
test "wide gamma rejects zero gamma even at endpoints and validates targets first" {
    for ([_]api.Target{ .{ .numerator = 0, .denominator = 1 }, .{ .numerator = 1, .denominator = 1 }, .{ .numerator = 1, .denominator = 2 } }) |target| try t.expectError(error.NonInvertibleIccGamma, api.invert(0, target));
    try t.expectError(error.InvalidIccCurveCoordinate, api.invert(0, .{ .numerator = 0, .denominator = 0 }));
    try t.expectError(error.InvalidIccCurveCoordinate, api.invert(512, .{ .numerator = 2, .denominator = 1 }));
    var r = (try api.invert(512, .{ .numerator = 1, .denominator = 2 })).power;
    r.denominator = 0;
    try t.expectError(error.InvalidIccPowerRoot, r.validate());
}
