const std = @import("std");
const levels = @import("normalized_power_level.zig");
const compare = @import("normalized_power_root_compare.zig").compare;

test "wide root comparison preserves exact equality and signed extreme coordinates" {
    const a: u256 = std.math.maxInt(u128);
    const b = a - 2;
    var root: levels.Root = .{ .nonzero = .{ .negative = false, .numerator = a * a, .denominator = b * b, .exponent_numerator = 65536, .exponent_denominator = 131072 } };
    try std.testing.expectEqual(.eq, (try compare(128, root, @intCast(a), b)).?);
    try std.testing.expectEqual(.gt, (try compare(512, root, @intCast(a - 1), b)).?);
    try std.testing.expectEqual(.lt, (try compare(512, root, @intCast(a + 1), b)).?);
    root.nonzero.exponent_numerator = -65536;
    try std.testing.expectEqual(.eq, (try compare(128, root, @intCast(b), a)).?);
    root.nonzero.negative = true;
    try std.testing.expectEqual(.eq, (try compare(128, root, -@as(i256, @intCast(b)), a)).?);
    root.nonzero.numerator = 1;
    root.nonzero.denominator = 1;
    try std.testing.expectEqual(.eq, (try compare(128, root, std.math.minInt(i256), @as(u256, 1) << 255)).?);
}

test "normalized generated roots compare without target quantization and preserve uncertainty" {
    const max = std.math.maxInt(u128);
    const roots = try levels.solve(65536, 1, max / 2, max);
    const r = roots.finite.roots[0];
    try std.testing.expect(r.nonzero.numerator > max and r.nonzero.denominator > max);
    try std.testing.expectEqual(.eq, (try compare(128, r, @intCast(r.nonzero.numerator), r.nonzero.denominator)).?);
    const sqrt = (try levels.solve(131072, 0, 1, 2)).finite.roots[0];
    const n = 161733217200188571081311986634082331709;
    const d = 228725309250740208744750893347264645481;
    try std.testing.expectEqual(@as(?std.math.Order, null), try compare(128, sqrt, n, d));
    try std.testing.expectEqual(.lt, (try compare(512, sqrt, n, d)).?);
}

test "wide root comparison validates operands before sign shortcuts" {
    var root: levels.Root = .{ .nonzero = .{ .negative = false, .numerator = 0, .denominator = 1, .exponent_numerator = 65536, .exponent_denominator = 1 } };
    try std.testing.expectError(error.InvalidIccPowerRoot, compare(128, root, -1, 1));
    root.nonzero.numerator = 1;
    root.nonzero.denominator = 0;
    try std.testing.expectError(error.InvalidIccPowerRoot, compare(128, root, 0, 1));
    try std.testing.expectError(error.InvalidIccRootCoordinate, compare(128, .zero, 1, 0));
    try std.testing.expectEqual(.gt, (try compare(128, .zero, -1, 1)).?);
}
