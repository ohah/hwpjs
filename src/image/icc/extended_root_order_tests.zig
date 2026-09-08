const std = @import("std");
const Root = @import("normalized_power_level.zig").Wide.Root;
const order = @import("normalized_root_order.zig").Wide;

fn root(n: u1024, d: u1024, negative: bool, p: i32) Root {
    return .{ .nonzero = .{ .numerator = n, .denominator = d, .negative = negative, .exponent_numerator = p, .exponent_denominator = 2147483648 } };
}

test "extended root order preserves adjacent full width ratios and equivalent fractions" {
    const m = std.math.maxInt(u1024);
    const h: u1024 = @as(u1024, 1) << 1023;
    try std.testing.expectEqual(.gt, try order.compare(root(h, h + 1, false, 65536), root(h - 1, h, false, 65536)));
    for ([_]bool{ false, true }) |negative| {
        for ([_]i32{ 65536, -65536 }) |p| {
            const a = root(m - 1, m, negative, p);
            const b = root(m - 2, m - 1, negative, p);
            const expected: std.math.Order = if ((p < 0) != negative) .lt else .gt;
            try std.testing.expectEqual(expected, try order.compare(a, b));
            try std.testing.expectEqual(expected.invert(), try order.compare(b, a));
            try std.testing.expectEqual(expected.invert(), try order.inAffine(a, b, std.math.minInt(i32)));
            try std.testing.expectEqual(.eq, try order.compare(root(m - 1, m - 1, negative, p), root(1, 1, negative, p)));
        }
    }
}

test "extended root order validates before sign shortcuts and narrow adapters retain limits" {
    const a = root(1, 1, false, 65536);
    for ([_]Root{ root(0, 1, true, 65536), root(1, 0, true, 65536), root(1, 1, true, 0) }) |bad| {
        try std.testing.expectError(error.InvalidIccPowerRoot, order.compare(.zero, bad));
        try std.testing.expectError(error.InvalidIccPowerRoot, order.compare(bad, a));
        try std.testing.expectError(error.NonIsolatedIccAffineRoot, order.inAffine(bad, a, 0));
    }
    try std.testing.expectError(error.IncompatibleIccPowerRoots, order.compare(a, root(1, 1, true, -65536)));
    try std.testing.expectEqual(.eq, try order.compare(.zero, .zero));
    try std.testing.expectEqual(.lt, try order.compare(root(1, 1, true, 65536), .zero));
    try std.testing.expectEqual(.lt, try order.compare(.zero, a));
    const narrow = @import("power_level.zig");
    const bad: narrow.Root = .{ .nonzero = .{ .numerator = 4294967296, .negative = false, .exponent_numerator = 65536, .exponent_denominator = 1 } };
    try std.testing.expectError(error.InvalidIccPowerRoot, narrow.widen(bad));
    try std.testing.expectError(error.InvalidIccPowerRoot, narrow.widenExtended(bad));
    try std.testing.expectError(error.InvalidIccPowerRoot, @import("power_root_order.zig").compare(.zero, bad));
}

test "extended root ordering agrees with independent small rational enumeration" {
    for (1..9) |an| for (1..9) |ad| {
        for (1..9) |bn| for (1..9) |bd| {
            const expected = std.math.order(an * bd, bn * ad);
            for ([_]bool{ false, true }) |negative| {
                for ([_]i32{ 65536, -65536 }) |p| {
                    const wanted = if ((p < 0) != negative) expected.invert() else expected;
                    try std.testing.expectEqual(wanted, try order.compare(root(an, ad, negative, p), root(bn, bd, negative, p)));
                }
            }
        };
    };
}
