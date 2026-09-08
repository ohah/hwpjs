const std = @import("std");
const level = @import("power_level.zig");
const compare = @import("power_root_compare.zig");
const integer = @import("integer_power.zig");

test "bounded integer powers distinguish overflow and perfect roots" {
    try std.testing.expectEqual(@as(?u128, 81), integer.bounded(3, 4, 81));
    try std.testing.expectEqual(@as(?u128, null), integer.bounded(3, 4, 80));
    try std.testing.expectEqual(@as(?u128, null), integer.bounded(2, 128, std.math.maxInt(u128)));
    try std.testing.expectEqual(@as(?u128, 0), integer.bounded(0, 4, 0));
    try std.testing.expectEqual(@as(?u128, 1), integer.bounded(0, 0, 1));
    try std.testing.expectEqual(@as(?u128, 3), integer.root(81, 4));
    try std.testing.expectEqual(@as(?u128, null), integer.root(80, 4));
    try std.testing.expectEqual(@as(?u128, null), integer.root(std.math.maxInt(u64), 64));
    try std.testing.expectEqual(@as(?u128, 1), integer.root(1, std.math.maxInt(u32)));
}

test "root comparison proves rational equality including negative reciprocal roots" {
    const roots = level.solve(-131072, -589824, 0).finite;
    try std.testing.expectEqual(.eq, (try compare.compare(256, roots.roots[0], 1, 3)).?);
    try std.testing.expectEqual(.eq, (try compare.compare(256, roots.roots[1], -2, 6)).?);
    try std.testing.expectEqual(.gt, (try compare.compare(256, roots.roots[0], 1, 4)).?);
    try std.testing.expectEqual(.lt, (try compare.compare(256, roots.roots[1], -1, 4)).?);
    try std.testing.expectEqual(.gt, (try compare.compare(256, .zero, -1, 3)).?);
    try std.testing.expectEqual(.eq, (try compare.compare(256, .zero, 0, 3)).?);
}

test "root comparison separates Pell coordinates without floating conversion" {
    const root = level.solve(131072, 32768, 65536).finite.roots[0];
    try std.testing.expectEqual(.gt, (try compare.at(256, root, 65536, 0, .{ .numerator = 4866752642924153522, .denominator = 6882627592338442563 })).?);
    try std.testing.expectEqual(.lt, (try compare.at(256, root, 65536, 0, .{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 })).?);
    const n: i128 = 66992092050551637663438906713182313772;
    const d: u128 = 94741125149636933417873079920900017937;
    try std.testing.expectEqual(@as(?std.math.Order, null), try compare.compare(128, root, n, d));
    try std.testing.expectEqual(.gt, (try compare.compare(512, root, n, d)).?);
    try std.testing.expectEqual(.lt, (try compare.compare(1024, root, 161733217200188571081311986634082331709, 228725309250740208744750893347264645481)).?);
}

test "root comparison validates descriptors and handles extreme exponents and coordinates" {
    var root = level.solve(-2147483648, -1, 65536).finite.roots[0];
    try std.testing.expectEqual(.lt, (try compare.compare(256, root, 1, 1)).?);
    try std.testing.expectEqual(.gt, (try compare.compare(256, root, std.math.minInt(i128), std.math.maxInt(u128))).?);
    try std.testing.expectError(error.InvalidIccRootCoordinate, compare.compare(256, root, 1, 0));
    root.nonzero.exponent_denominator = 0;
    try std.testing.expectError(error.InvalidIccPowerRoot, compare.compare(256, root, 1, 1));
    root = level.solve(131072, 0, 65536).finite.roots[1];
    try std.testing.expectEqual(.lt, (try compare.compare(256, root, std.math.minInt(i128), std.math.maxInt(u128))).?);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, compare.at(256, root, 65536, 0, .{ .numerator = 2, .denominator = 1 }));
}
