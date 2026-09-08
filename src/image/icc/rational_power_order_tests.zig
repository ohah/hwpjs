const std = @import("std");
const compare = @import("rational_power_order.zig").compare;
const integer = @import("integer_power.zig");
test "integer perfect roots cover full u128 without overflow" {
    const max = std.math.maxInt(u128);
    try std.testing.expectEqual(max, integer.root(max, 1).?);
    try std.testing.expect(integer.root(max, 2) == null);
    const a: u128 = std.math.maxInt(u64);
    try std.testing.expectEqual(a, integer.root(a * a, 2).?);
    try std.testing.expectEqual(@as(u128, 2), integer.root(@as(u128, 1) << 127, 127).?);
    try std.testing.expect(integer.root(max, 128) == null);
    try std.testing.expect(integer.root(0, 1) == null);
    try std.testing.expect(integer.root(1, 0) == null);
}
test "rational power order preserves non fixed16 equality and extreme operands" {
    try std.testing.expectEqual(.eq, (try compare(128, 9, 49, 32768, 3, 7)).?);
    try std.testing.expectEqual(.eq, (try compare(128, 9, 49, -32768, 7, 3)).?);
    const a: u128 = std.math.maxInt(u64);
    // Both perfect squares exceed u64; old radical-only equality cannot represent this base.
    try std.testing.expectEqual(.eq, (try compare(128, @intCast((a / 2) * (a / 2)), a * a, 32768, @intCast(a / 2), a)).?);
    try std.testing.expectEqual(.eq, (try compare(128, std.math.minInt(i128), @as(u128, 1) << 127, 65536, -1, 1)).?);
    try std.testing.expectEqual(.eq, (try compare(128, 1, 1, std.math.minInt(i32), 1, 1)).?);
    try std.testing.expectEqual(.lt, (try compare(128, 2, 1, std.math.minInt(i32), 1, 1)).?);
    try std.testing.expectEqual(.gt, (try compare(128, 2, 1, std.math.maxInt(i32), 1, 1)).?);
}
test "rational power order rejects invalid domains before sign shortcuts" {
    try std.testing.expectError(error.InvalidIccPowerCoordinate, compare(128, 0, 0, 1, 0, 1));
    try std.testing.expectError(error.InvalidIccPowerCoordinate, compare(128, 1, 1, 0, 0, 0));
    try std.testing.expectError(error.UndefinedIccCurvePower, compare(128, -1, 1, 32768, -1, 1));
    try std.testing.expectError(error.UndefinedIccCurvePower, compare(128, 0, 1, 0, -1, 1));
    try std.testing.expectError(error.UndefinedIccCurvePower, compare(128, 0, 1, -1, 1, 1));
    try std.testing.expectEqual(.gt, (try compare(128, -2, 3, 0, 1, 2)).?);
    try std.testing.expectEqual(.eq, (try compare(128, 0, 1, 1, 0, 1)).?);
}
fn pow(n: u256, p: u32) u256 {
    var result: u256 = 1;
    for (0..p) |_| result *= n;
    return result;
}
test "rational power order matches independent small exact cross powers" {
    for ([_]i32{ -131072, -65536, -32768, 0, 16384, 32768, 65536, 131072, 196608 }) |g| {
        for (1..5) |an| for (1..5) |ad| for (1..5) |tn| for (1..5) |td| {
            const common = std.math.gcd(@abs(g), @as(u32, 65536));
            const p = @abs(g) / common;
            const q = 65536 / common;
            const a = if (g < 0) ad else an;
            const b = if (g < 0) an else ad;
            const expected = std.math.order(pow(a, p) * pow(td, q), pow(b, p) * pow(tn, q));
            try std.testing.expectEqual(expected, (try compare(256, @intCast(an), ad, g, @intCast(tn), td)).?);
            if (@rem(g, 65536) == 0) {
                const negative = @rem(@divTrunc(g, 65536), 2) != 0;
                const target: i128 = if (negative) -@as(i128, @intCast(tn)) else @intCast(tn);
                try std.testing.expectEqual(if (negative) expected.invert() else expected, (try compare(256, -@as(i128, @intCast(an)), ad, g, target, td)).?);
            }
        };
    }
}
