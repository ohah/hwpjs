const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const api = @import("power_range.zig");
fn at(endpoint: api.types.Endpoint, n: u64, d: u64) !void {
    try std.testing.expectEqual(.eq, try endpoint.at.order(.{ .numerator = n, .denominator = d }));
}
test "same power order preserves parity reciprocal signs and validates both bases" {
    const compare = @import("same_power_order.zig").compare;
    for ([_]i32{ 65536, 131072, 196608, -65536, -131072, -196608, 32768, -32768 }) |g| {
        const expected: std.math.Order = if (g > 0) .lt else .gt;
        try std.testing.expectEqual(expected, try compare(g, .{ .numerator = 1, .denominator = 3 }, .{ .numerator = 2, .denominator = 3 }));
    }
    try std.testing.expectEqual(.gt, try compare(65536, .{ .numerator = -1, .denominator = 3 }, .{ .numerator = -2, .denominator = 3 }));
    try std.testing.expectEqual(.lt, try compare(131072, .{ .numerator = -1, .denominator = 3 }, .{ .numerator = -2, .denominator = 3 }));
    try std.testing.expectEqual(.lt, try compare(-65536, .{ .numerator = -1, .denominator = 3 }, .{ .numerator = -2, .denominator = 3 }));
    try std.testing.expectError(error.UndefinedIccCurvePower, compare(32768, .{ .numerator = 1, .denominator = 1 }, .{ .numerator = -1, .denominator = 1 }));
    try std.testing.expectError(error.UndefinedIccCurvePower, compare(0, .{ .numerator = 1, .denominator = 1 }, .{ .numerator = 0, .denominator = 1 }));
    try std.testing.expectError(error.InvalidIccPowerCoordinate, compare(65536, .{ .numerator = 0, .denominator = 1 }, .{ .numerator = 1, .denominator = 0 }));
    const m = std.math.maxInt(u128);
    try std.testing.expectEqual(.gt, try compare(65536, .{ .numerator = std.math.maxInt(i128), .denominator = m - 1 }, .{ .numerator = std.math.maxInt(i128), .denominator = m }));
}
test "power range includes interior folded minimum and clips attained extrema" {
    var curve = Curve{ .function = .type3, .values = .{ 131072, 262144, -131072, 0, 0, 0, 0 } };
    const folded = (try api.build(512, curve)).range;
    try at(folded.lower, 1, 2);
    try std.testing.expectEqual(@as(u256, 0), folded.lower.value.rational.numerator);
    try std.testing.expectEqual(@as(u256, 1), folded.upper.value.rational.numerator);
    curve = .{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 32768, 0 } };
    const offset = (try api.build(512, curve)).range;
    try at(offset.lower, 1, 2);
    try std.testing.expectEqual(@as(i128, 0), offset.lower.value.power.base.numerator);
    try std.testing.expectEqual(@as(i32, 32768), offset.lower.value.power.offset);
    try std.testing.expectEqual(@as(u256, 1), offset.upper.value.rational.numerator);
}
test "power range preserves decreasing fractional output and constant witnesses" {
    var curve = Curve{ .function = .type3, .values = .{ -65536, 65536, 65536, 0, 0, 0, 0 } };
    const reciprocal = (try api.build(512, curve)).range;
    try at(reciprocal.lower, 1, 1);
    try at(reciprocal.upper, 0, 1);
    try std.testing.expectEqual(@as(i32, -65536), reciprocal.lower.value.power.g);
    curve.values = .{ 32768, 32768, 0, 0, 0, 0, 0 };
    const sqrt = (try api.build(512, curve)).range;
    try at(sqrt.upper, 1, 1);
    try std.testing.expectEqual(@as(i32, 32768), sqrt.upper.value.power.g);
    curve = .{ .function = .type4, .values = .{ 0, 0, 65536, 0, 0, -32768, 0 } };
    const constant = (try api.build(512, curve)).range;
    try at(constant.lower, 0, 1);
    try at(constant.upper, 0, 1);
    try std.testing.expectEqual(@as(i32, 0), constant.lower.value.power.g);
}
test "power range validates whole domain and preserves terminal singleton" {
    const invalid = Curve{ .function = .type0, .values = .{ 0, 0, 0, 0, 0, 0, 0 } };
    try std.testing.expectError(error.UndefinedIccCurvePower, api.build(128, invalid));
    var curve = Curve{ .function = .type3, .values = .{ 65536, 65536, 0, 65536, 65537, 0, 0 } };
    try std.testing.expect((try api.build(128, curve)) == .inactive);
    curve.values[4] = 65536;
    const terminal = (try api.build(128, curve)).range;
    try at(terminal.lower, 1, 1);
    try at(terminal.upper, 1, 1);
}

test "power ordinate preserves a real clipping uncertainty and resolves it at higher precision" {
    const source = @import("parametric_segments.zig").Power{ .interval = .{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 } }, .a = 65536, .b = 0, .g = 131072, .offset = -32768 };
    const hi = @import("fraction.zig").Fraction{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 };
    const ordinate = @import("power_ordinate.zig");
    try std.testing.expect(try ordinate.at(128, source, hi) == null);
    try std.testing.expect((try ordinate.at(512, source, hi)).? == .power);
    const lo = (try ordinate.at(128, source, .{ .numerator = 4866752642924153522, .denominator = 6882627592338442563 })).?;
    try std.testing.expectEqual(@as(u256, 0), lo.rational.numerator);
}
