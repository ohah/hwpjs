const std = @import("std");
const I = @import("integer_power.zig").Of(256);
const E = @import("rational_power_equality.zig").Of(256);

test "wide perfect roots preserve 256 bit extremes and adjacent non powers" {
    const max = std.math.maxInt(u256);
    const a: u256 = std.math.maxInt(u128);
    try std.testing.expectEqual(a, I.root(a * a, 2).?);
    try std.testing.expect(I.root(a * a - 1, 2) == null);
    try std.testing.expect(I.root(a * a + 1, 2) == null);
    try std.testing.expectEqual(@as(u256, 2), I.root(@as(u256, 1) << 255, 255).?);
    try std.testing.expect(I.root(max, 256) == null);
    try std.testing.expectEqual(max, I.root(max, 1).?);
    try std.testing.expectEqual(@as(u256, 1), I.root(1, std.math.maxInt(u32)).?);
    try std.testing.expect(I.root(0, 1) == null);
    try std.testing.expect(I.root(1, 0) == null);
    try std.testing.expectEqual(a * a, I.bounded(a, 2, a * a).?);
    try std.testing.expect(I.bounded(a, 2, a * a - 1) == null);
    try std.testing.expect(I.bounded(2, 256, max) == null);
    try std.testing.expectEqual(@as(u256, 0), I.bounded(0, 3, 0).?);
    try std.testing.expectEqual(@as(u256, 1), I.bounded(0, 0, 1).?);
    try std.testing.expect(I.bounded(0, 0, 0) == null);
}

test "wide rational power equality reduces all three ratios without narrowing" {
    const a: u256 = std.math.maxInt(u128);
    const b = a - 2;
    try std.testing.expect(E.matches(a * a, b * b, 65536, 131072, a, b));
    try std.testing.expect(!E.matches(a * a - 1, b * b, 65536, 131072, a, b));
    try std.testing.expect(!E.matches(a * a, b * b, 65536, 131072, a - 1, b));
    const scale: u256 = @as(u256, 1) << 200;
    try std.testing.expect(E.matches(9 * scale, 49 * scale, 2, 4, 3 * scale, 7 * scale));
    try std.testing.expect(E.matches(49 * scale, 9 * scale, 2, 4, 7 * scale, 3 * scale));
    try std.testing.expect(!E.matches(2 * scale, scale, 1, 2, scale, scale));
    try std.testing.expect(E.matches(scale, scale, 4294967295, 2147483648, scale, scale));
}

test "wide equality agrees with direct small integer cross powers" {
    for (1..8) |a| for (1..8) |b| for (1..5) |p| for (1..5) |q| for (1..8) |n| for (1..8) |d| {
        // Independent repeated multiplication, not bounded power/root helpers.
        var left: u256 = 1;
        var right: u256 = 1;
        for (0..p) |_| {
            left *= a;
            right *= b;
        }
        for (0..q) |_| {
            left *= d;
            right *= n;
        }
        try std.testing.expectEqual(left == right, E.matches(a, b, @intCast(p), @intCast(q), n, d));
    };
}
