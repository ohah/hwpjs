const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const select = @import("parametric_inverse.zig").select;
fn expectX(coordinate: @import("parametric_attained_inverse.zig").Coordinate, n: u64, d: u64) !void {
    const order = switch (coordinate) {
        .rational => |r| try r.order(.{ .numerator = n, .denominator = d }),
        .power_root => |r| (try @import("normalized_power_root_compare.zig").at(512, r.root, r.a, r.b, .{ .numerator = n, .denominator = d })).?,
    };
    try std.testing.expectEqual(.eq, order);
}
test "full inverse retains attained targets and applies both clipping plateau rules" {
    var curve = Curve{ .function = .type0, .values = .{ 65536, 0, 0, 0, 0, 0, 0 } };
    try expectX((try select(512, curve, .{ .numerator = 1, .denominator = 3 })).selected.coordinate, 1, 3);
    curve = .{ .function = .type3, .values = .{ 65536, 131072, -32768, 0, 0, 0, 0 } };
    try expectX((try select(512, curve, .{ .numerator = 0, .denominator = 1 })).selected.coordinate, 1, 4);
    try expectX((try select(512, curve, .{ .numerator = 1, .denominator = 1 })).selected.coordinate, 3, 4);
}
test "symbolic nearest output uses start of terminal constant plateau" {
    var curve = Curve{ .function = .type3, .values = .{ 32768, 0, 32768, 32768, 32768, 0, 0 } };
    const result = (try select(512, curve, .{ .numerator = 1, .denominator = 1 })).selected;
    try std.testing.expect(result.ordinate == .power_endpoint);
    try std.testing.expect(result.ordinate.power_endpoint.value == .power);
    try expectX(result.coordinate, 1, 2);
    try expectX((try select(512, curve, .{ .numerator = 0, .denominator = 1 })).selected.coordinate, 0, 1);
    curve = .{ .function = .type4, .values = .{ 0, 65536, 65536, 32768, 32768, -32768, 0 } };
    try expectX((try select(512, curve, .{ .numerator = 1, .denominator = 1 })).selected.coordinate, 1, 2);
    curve.values = .{ 32768, 0, 32768, -32768, 32768, 0, 65536 };
    try expectX((try select(512, curve, .{ .numerator = 0, .denominator = 1 })).selected.coordinate, 1, 2);
}
test "symbolic nearest strict endpoints preserve unique inverse coordinates" {
    var curve = Curve{ .function = .type3, .values = .{ 32768, 32768, 0, 0, 0, 0, 0 } };
    try expectX((try select(512, curve, .{ .numerator = 1, .denominator = 1 })).selected.coordinate, 1, 1);
    curve.values[4] = 32768;
    try expectX((try select(512, curve, .{ .numerator = 2, .denominator = 5 })).selected.coordinate, 1, 2);
    curve = .{ .function = .type4, .values = .{ 131072, -65536, 65536, 0, 0, 16384, 0 } };
    try expectX((try select(512, curve, .{ .numerator = 0, .denominator = 1 })).selected.coordinate, 1, 1);
}
test "full inverse separates missing closest output ambiguous output and unattained x maximum" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } };
    try std.testing.expect((try select(512, curve, .{ .numerator = 3, .denominator = 5 })) == .unattained);
    try expectX((try select(512, curve, .{ .numerator = 3, .denominator = 4 })).selected.coordinate, 1, 2);
    curve.values[3] = 0;
    const tie = (try select(512, curve, .{ .numerator = 1, .denominator = 2 })).ambiguous;
    try std.testing.expectEqual(@as(u256, 0), tie.linear.numerator);
    try std.testing.expectEqual(@as(u256, 1), tie.power_endpoint.value.rational.numerator);
    try std.testing.expectError(error.UnattainedIccPreimageMaximum, select(512, curve, .{ .numerator = 0, .denominator = 1 }));
}
test "full inverse rejects constant and nonmonotonic curves before point selection" {
    var curve = Curve{ .function = .type3, .values = .{ 65536, 0, 32768, 0, 0, 0, 0 } };
    try std.testing.expectError(error.ConstantIccCurve, select(512, curve, .{ .numerator = 1, .denominator = 2 }));
    curve.values = .{ 131072, 131072, -65536, 0, 0, 0, 0 };
    try std.testing.expectError(error.NonMonotonicIccCurve, select(512, curve, .{ .numerator = 0, .denominator = 1 }));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, select(512, curve, .{ .numerator = 0, .denominator = 0 }));
}
