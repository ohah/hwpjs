const std = @import("std");
const select = @import("power_range_nearest.zig").select;
const Curve = @import("parametric_curve.zig").Curve;
test "power nearest preserves interior targets even when input folds" {
    const curve = Curve{ .function = .type4, .values = .{ 131072, 262144, -131072, 0, 0, 16384, 0 } };
    const middle = try select(512, curve, .{ .numerator = 1, .denominator = 2 });
    try std.testing.expectEqual(@as(u128, 1), middle.target.numerator);
    try std.testing.expectEqual(@as(u128, 2), middle.target.denominator);
    const low = (try select(512, curve, .{ .numerator = 0, .denominator = 1 })).endpoint;
    try std.testing.expectEqual(.eq, try low.at.order(.{ .numerator = 1, .denominator = 2 }));
    try std.testing.expectEqual(@as(i32, 16384), low.value.power.offset);
    try std.testing.expect((try select(512, curve, .{ .numerator = 1, .denominator = 1 })) == .target);
}
test "power nearest handles decreasing range constant and inactive source" {
    var curve = Curve{ .function = .type3, .values = .{ -65536, 65536, 65536, 0, 0, 0, 0 } };
    try std.testing.expectEqual(@as(u64, 1), (try select(512, curve, .{ .numerator = 0, .denominator = 1 })).endpoint.at.numerator);
    curve.values = .{ 65536, 0, 32768, 65536, 65536, 0, 0 };
    try std.testing.expect((try select(512, curve, .{ .numerator = 1, .denominator = 2 })) == .target);
    try std.testing.expectEqual(@as(u64, 65536), (try select(512, curve, .{ .numerator = 1, .denominator = 1 })).endpoint.at.numerator);
    curve.values[4] = 65537;
    try std.testing.expect((try select(512, curve, .{ .numerator = 0, .denominator = 1 })) == .inactive);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, select(512, curve, .{ .numerator = 2, .denominator = 1 }));
}
test "power nearest propagates actual precision uncertainty and domain errors" {
    var curve = Curve{ .function = .type3, .values = .{ 32768, 0, 32768, 0, 0, 0, 0 } };
    const target = @import("power_range_nearest.zig").Target{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 };
    try std.testing.expect((try select(128, curve, target)) == .undecided);
    try std.testing.expect((try select(512, curve, target)) == .endpoint);
    curve.values[2] = -32768;
    try std.testing.expectError(error.UndefinedIccCurvePower, select(512, curve, target));
}
