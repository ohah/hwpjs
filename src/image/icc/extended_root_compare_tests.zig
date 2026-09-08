const std = @import("std");
const t = std.testing;
const level = @import("normalized_power_level.zig");
const compare = @import("normalized_power_root_compare.zig").compareWide;
test "extended roots preserve perfect powers above 512 bits at every precision" {
    const a: u1024 = std.math.maxInt(u512);
    const b = a - 2;
    var r: level.Wide.Root = .{ .nonzero = .{ .negative = false, .numerator = a * a, .denominator = b * b, .exponent_numerator = 65536, .exponent_denominator = 131072 } };
    inline for (.{ 128, 256, 512, 1024 }) |precision| {
        try t.expectEqual(.eq, (try compare(precision, r, @intCast(a), b)).?);
    }
    try t.expectEqual(.gt, (try compare(1024, r, @intCast(a - 1), b)).?);
    try t.expectEqual(.lt, (try compare(1024, r, @intCast(a + 1), b)).?);
    r.nonzero.exponent_numerator = -65536;
    r.nonzero.negative = true;
    try t.expectEqual(.eq, (try compare(128, r, -@as(i1024, @intCast(b)), a)).?);
}
test "extended roots retain uncertainty instead of declaring equality" {
    const r = (try level.solveWide(131072, 0, 1, 2)).finite.roots[0];
    const n = 161733217200188571081311986634082331709;
    const d = 228725309250740208744750893347264645481;
    try t.expectEqual(@as(?std.math.Order, null), try compare(128, r, n, d));
    try t.expectEqual(.lt, (try compare(512, r, n, d)).?);
    const large: u1024 = @as(u1024, 1) << 800;
    try t.expectEqual(.lt, (try compare(128, r, @intCast(large), 1)).?);
    try t.expectEqual(.gt, (try compare(128, r, 1, large)).?);
}
test "extended roots compare generated targets and signed coordinate extrema" {
    const max = std.math.maxInt(u512);
    const r = (try level.solveWide(65536, std.math.minInt(i32), max - 1, max)).finite.roots[0];
    try t.expectEqual(.eq, (try compare(128, r, @intCast(r.nonzero.numerator), r.nonzero.denominator)).?);
    const unit: level.Wide.Root = .{ .nonzero = .{ .negative = true, .numerator = 1, .denominator = 1, .exponent_numerator = -65536, .exponent_denominator = 2147483648 } };
    try t.expectEqual(.eq, (try compare(128, unit, std.math.minInt(i1024), @as(u1024, 1) << 1023)).?);
    try t.expectEqual(.gt, (try compare(128, .zero, std.math.minInt(i1024), 1)).?);
}
test "extended root validation precedes shortcuts" {
    var r: level.Wide.Root = .{ .nonzero = .{ .negative = false, .numerator = 0, .denominator = 1, .exponent_numerator = 65536, .exponent_denominator = 1 } };
    try t.expectError(error.InvalidIccPowerRoot, compare(128, r, -1, 1));
    r.nonzero.numerator = 1;
    r.nonzero.denominator = 0;
    try t.expectError(error.InvalidIccPowerRoot, compare(128, r, 0, 1));
    try t.expectError(error.InvalidIccRootCoordinate, compare(128, .zero, 0, 0));
}
