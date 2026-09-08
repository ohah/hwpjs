const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const select = @import("parametric_inverse.zig").selectWide;
test "extended inverse retains full width targets and wider rational coordinates" {
    const max = std.math.maxInt(u512);
    const curve = Curve{ .function = .type4, .values = .{ 65536, 65536, 0, 65537, 65537, 0, 0 } };
    const result = try chosen(try select(1024, curve, .{ .numerator = max - 1, .denominator = max }));
    try std.testing.expect(result.ordinate == .rational);
    try std.testing.expectEqual(max - 1, result.ordinate.rational.numerator);
    try std.testing.expectEqual(max, result.ordinate.rational.denominator);
    try std.testing.expect(result.coordinate == .rational);
    try std.testing.expectEqual(.eq, try result.coordinate.rational.order(.{ .numerator = @as(u1024, 65536) * (max - 1), .denominator = @as(u1024, 65537) * max }));
}
fn expectX(coordinate: @import("parametric_attained_inverse.zig").Wide.Coordinate, n: u64, d: u64) !void {
    const order = switch (coordinate) {
        .rational => |r| try r.order(.{ .numerator = n, .denominator = d }),
        .power_root => |r| blk: {
            const result = try @import("normalized_power_root_compare.zig").Wide.at(512, r.root, r.a, r.b, .{ .numerator = n, .denominator = d });
            try std.testing.expect(result != null);
            break :blk result.?;
        },
    };
    try std.testing.expectEqual(.eq, order);
}
test "extended full inverse retains attained targets and applies both clipping plateau rules" {
    var curve = Curve{ .function = .type0, .values = .{ 65536, 0, 0, 0, 0, 0, 0 } };
    try expectX((try chosen(try select(512, curve, .{ .numerator = 1, .denominator = 3 }))).coordinate, 1, 3);
    curve = .{ .function = .type3, .values = .{ 65536, 131072, -32768, 0, 0, 0, 0 } };
    try expectX((try chosen(try select(512, curve, .{ .numerator = 0, .denominator = 1 }))).coordinate, 1, 4);
    try expectX((try chosen(try select(512, curve, .{ .numerator = 1, .denominator = 1 }))).coordinate, 3, 4);
}
test "extended symbolic nearest output uses start of terminal constant plateau" {
    var curve = Curve{ .function = .type3, .values = .{ 32768, 0, 32768, 32768, 32768, 0, 0 } };
    const result = (try chosen(try select(512, curve, .{ .numerator = 1, .denominator = 1 })));
    try std.testing.expect(result.ordinate == .power_endpoint);
    try std.testing.expect(result.ordinate.power_endpoint.value == .power);
    try expectX(result.coordinate, 1, 2);
    try expectX((try chosen(try select(512, curve, .{ .numerator = 0, .denominator = 1 }))).coordinate, 0, 1);
    curve = .{ .function = .type4, .values = .{ 0, 65536, 65536, 32768, 32768, -32768, 0 } };
    try expectX((try chosen(try select(512, curve, .{ .numerator = 1, .denominator = 1 }))).coordinate, 1, 2);
    curve.values = .{ 32768, 0, 32768, -32768, 32768, 0, 65536 };
    try expectX((try chosen(try select(512, curve, .{ .numerator = 0, .denominator = 1 }))).coordinate, 1, 2);
}
test "extended symbolic nearest strict endpoints preserve unique inverse coordinates" {
    var curve = Curve{ .function = .type3, .values = .{ 32768, 32768, 0, 0, 0, 0, 0 } };
    try expectX((try chosen(try select(512, curve, .{ .numerator = 1, .denominator = 1 }))).coordinate, 1, 1);
    curve.values[4] = 32768;
    try expectX((try chosen(try select(512, curve, .{ .numerator = 2, .denominator = 5 }))).coordinate, 1, 2);
    curve = .{ .function = .type4, .values = .{ 131072, -65536, 65536, 0, 0, 16384, 0 } };
    try expectX((try chosen(try select(512, curve, .{ .numerator = 0, .denominator = 1 }))).coordinate, 1, 1);
}
test "extended full inverse separates missing closest output ambiguous output and unattained x maximum" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 65536, 32768, 65536, 0 } };
    try std.testing.expect((try select(512, curve, .{ .numerator = 3, .denominator = 5 })) == .unattained);
    try expectX((try chosen(try select(512, curve, .{ .numerator = 3, .denominator = 4 }))).coordinate, 1, 2);
    curve.values[3] = 0;
    const result = try select(512, curve, .{ .numerator = 1, .denominator = 2 });
    try std.testing.expect(result == .ambiguous);
    const tie = result.ambiguous;
    try std.testing.expect(tie.power_endpoint.value == .rational);
    try std.testing.expectEqual(@as(u256, 0), tie.linear.numerator);
    try std.testing.expectEqual(@as(u256, 1), tie.power_endpoint.value.rational.numerator);
    try std.testing.expectError(error.UnattainedIccPreimageMaximum, select(512, curve, .{ .numerator = 0, .denominator = 1 }));
}
test "extended full inverse rejects constant and nonmonotonic curves before point selection" {
    var curve = Curve{ .function = .type3, .values = .{ 65536, 0, 32768, 0, 0, 0, 0 } };
    try std.testing.expectError(error.ConstantIccCurve, select(512, curve, .{ .numerator = 1, .denominator = 2 }));
    curve.values = .{ 131072, 131072, -65536, 0, 0, 0, 0 };
    try std.testing.expectError(error.NonMonotonicIccCurve, select(512, curve, .{ .numerator = 0, .denominator = 1 }));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, select(512, curve, .{ .numerator = 0, .denominator = 0 }));
}

fn chosen(result: @import("parametric_inverse.zig").Wide.Result) !@import("parametric_inverse.zig").Wide.Selected {
    try std.testing.expect(result == .selected);
    return result.selected;
}
