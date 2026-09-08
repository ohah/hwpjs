const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const api = @import("parametric_preimage_bounds.zig");

fn rational(endpoint: api.Endpoint, n: u256, d: u256, attained: bool) !void {
    try std.testing.expectEqual(attained, endpoint.attained);
    try std.testing.expectEqual(.eq, try endpoint.coordinate.rational.order(.{ .numerator = n, .denominator = d }));
}

test "whole bounds distinguish open supremum empty gap and closed terminal" {
    var curve = Curve{ .function = .type4, .values = .{ 65536, 0, 0, 0, 32768, 65536, 0 } };
    const zero = (try api.solve(128, curve, 0, 1)).bounds;
    try rational(zero.lower, 0, 1, true);
    try rational(zero.upper, 1, 2, false);
    try std.testing.expect((try api.solve(128, curve, 1, 2)) == .empty);
    const one = (try api.solve(128, curve, 1, 1)).bounds;
    try rational(one.lower, 1, 2, true);
    try rational(one.upper, 1, 1, true);
    curve.values = .{ 65536, 0, 0, 0, 65536, 0, 0 };
    const terminal = (try api.solve(128, curve, 0, 1)).bounds;
    try rational(terminal.lower, 0, 1, true);
    try rational(terminal.upper, 1, 1, true);
}

test "whole bounds order disconnected roots in x including negative slopes" {
    var curve = Curve{ .function = .type4, .values = .{ 131072, 262144, -196608, 65536, 32768, 0, 0 } };
    const three = (try api.solve(512, curve, 1, 4)).bounds;
    try rational(three.lower, 1, 4, true);
    try std.testing.expect(three.upper.attained);
    try std.testing.expect(!three.upper.coordinate.power_root.root.nonzero.negative);
    curve = .{ .function = .type3, .values = .{ 131072, -131072, 65536, 0, 0, 0, 0 } };
    const two = (try api.solve(512, curve, 1, 4)).bounds;
    try std.testing.expect(!two.lower.coordinate.power_root.root.nonzero.negative);
    try std.testing.expect(two.upper.coordinate.power_root.root.nonzero.negative);
    try std.testing.expect(two.lower.attained and two.upper.attained);
}

test "power bounds merge excluded clipping boundary with attained equality point" {
    const curve = Curve{ .function = .type3, .values = .{ 65536, -131072, 131072, 0, 0, 0, 0 } };
    const one = (try api.solve(512, curve, 1, 1)).bounds;
    try rational(one.lower, 0, 1, true);
    try std.testing.expect(one.upper.attained);
    const root = one.upper.coordinate.power_root;
    try std.testing.expectEqual(.eq, (try @import("normalized_power_root_compare.zig").at(512, root.root, root.a, root.b, .{ .numerator = 1, .denominator = 2 })).?);
}

test "whole bounds preserve uncertainty and whole domain errors" {
    const curve = Curve{ .function = .type3, .values = .{ 131072, 65537, 0, 65536, 1, 0, 0 } };
    const n = @as(u128, 65537) * 65537 << 64;
    const d = std.math.maxInt(u128);
    try std.testing.expect((try api.solve(128, curve, n, d)) == .undecided);
    try std.testing.expect((try api.solve(512, curve, n, d)) == .bounds);
    const invalid = Curve{ .function = .type4, .values = .{ 0, 0, 0, 0, 32768, 0, 0 } };
    try std.testing.expectError(error.UndefinedIccCurvePower, api.solve(128, invalid, 0, 1));
    try std.testing.expectError(error.InvalidIccCurveCoordinate, api.solve(128, invalid, 1, 0));
}

test "inactive power preserves full width linear coordinates" {
    const d = std.math.maxInt(u128);
    const n = d / 2;
    const curve = Curve{ .function = .type3, .values = .{ 65536, 65536, 0, 65537, 65537, 0, 0 } };
    const result = (try api.solve(512, curve, n, d)).bounds;
    try rational(result.lower, @as(u256, 65536) * n, @as(u256, 65537) * d, true);
    try rational(result.upper, @as(u256, 65536) * n, @as(u256, 65537) * d, true);
}

fn exact(endpoint: api.Endpoint, x: @import("fraction.zig").Fraction) !void {
    try std.testing.expect(endpoint.attained);
    switch (endpoint.coordinate) {
        .rational => try rational(endpoint, x.numerator, x.denominator, true),
        .power_root => |r| try std.testing.expectEqual(.eq, (try @import("normalized_power_root_compare.zig").at(512, r.root, r.a, r.b, x)).?),
    }
}

test "quadratic bounds match independent rational endpoint and root enumeration" {
    const F = @import("fraction.zig").Fraction;
    for ([_]i32{ -262144, -131072, -65536, -32768, 32768, 65536, 131072, 262144 }) |a| {
        for ([_]i32{ -131072, -98304, -65536, -32768, 0, 32768, 65536, 98304, 131072 }) |b| {
            for ([_]i32{ 0, 32768, 65536 }) |level| {
                var candidates: [4]F = undefined;
                var count: usize = 0;
                // For a continuous quadratic on a closed domain, the extrema of
                // each level set are domain endpoints or exact ±sqrt(y) roots.
                for ([_]i64{ 0, 1 }) |x| {
                    const base = @as(i64, a) * x + b;
                    const square = base * base;
                    const target = @as(i64, level) * level;
                    if ((level == 65536 and square >= target) or square == target) {
                        candidates[count] = .{ .numerator = @intCast(x), .denominator = 1 };
                        count += 1;
                    }
                }
                for ([_]i64{ -@as(i64, level), level }) |z| {
                    var n = z - b;
                    var d: i64 = a;
                    if (d < 0) {
                        n = -n;
                        d = -d;
                    }
                    if (n < 0 or n > d) continue;
                    candidates[count] = .{ .numerator = @intCast(n), .denominator = @intCast(d) };
                    count += 1;
                }
                const curve = Curve{ .function = .type3, .values = .{ 131072, a, b, 0, 0, 0, 0 } };
                const result = try api.solve(512, curve, @intCast(@as(i64, level) * level), 4294967296);
                if (count == 0) {
                    try std.testing.expect(result == .empty);
                    continue;
                }
                var lo = candidates[0];
                var hi = lo;
                for (candidates[1..count]) |x| {
                    if (try x.order(lo) == .lt) lo = x;
                    if (try x.order(hi) == .gt) hi = x;
                }
                try exact(result.bounds.lower, lo);
                try exact(result.bounds.upper, hi);
            }
        }
    }
}
