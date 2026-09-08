const std = @import("std");
const level = @import("power_level.zig");
const order = @import("power_root_order.zig");
test "same-exponent root ordering handles signs reciprocals and affine orientation" {
    for ([_]i32{ 131072, -131072 }) |g| {
        const a = level.solve(g, 0, 16384).finite;
        const b = level.solve(g, 0, 65536).finite;
        const expected: std.math.Order = if (g > 0) .lt else .gt;
        try std.testing.expectEqual(expected, try order.compare(a.roots[0], b.roots[0]));
        try std.testing.expectEqual(expected.invert(), try order.compare(a.roots[1], b.roots[1]));
        try std.testing.expectEqual(expected.invert(), try order.inAffine(a.roots[0], b.roots[0], std.math.minInt(i32)));
        try std.testing.expectEqual(.lt, try order.compare(a.roots[1], .zero));
        try std.testing.expectEqual(.lt, try order.compare(.zero, a.roots[0]));
    }
    const a = level.solve(65536, 0, 65536).finite.roots[0];
    const b = level.solve(131072, 0, 65536).finite.roots[0];
    try std.testing.expectError(error.IncompatibleIccPowerRoots, order.compare(a, b));
    try std.testing.expectError(error.NonIsolatedIccAffineRoot, order.inAffine(a, a, 0));
}
