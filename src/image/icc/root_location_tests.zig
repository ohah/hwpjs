const std = @import("std");
const location = @import("affine_root_location.zig");
const levels = @import("power_level_locations.zig");
const level = @import("power_level.zig");
const Curve = @import("parametric_curve.zig").Curve;
const Interval = @import("unit_interval.zig").Interval;
const full = Interval{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 } };

test "affine root ownership respects open endpoints and slope direction" {
    for ([_]bool{ false, true }) |start| for ([_]bool{ false, true }) |end| {
        var interval = full;
        interval.start_included = start;
        interval.end_included = end;
        try std.testing.expectEqual(if (start) location.Location.start else .absent, try location.locate(256, .zero, 65536, 0, interval));
        try std.testing.expectEqual(if (end) location.Location.end else .absent, try location.locate(256, .zero, -65536, 65536, interval));
        try std.testing.expectEqual(.interior, try location.locate(256, .zero, 65536, -32768, interval));
        try std.testing.expectEqual(.interior, try location.locate(256, .zero, -65536, 32768, interval));
    };
}

test "affine root location separates singleton and constant base preimages" {
    var point = full;
    point.start = point.end;
    try std.testing.expectEqual(.singleton, try location.locate(256, .zero, 65536, -65536, point));
    try std.testing.expectEqual(.entire, try location.locate(256, .zero, 0, 0, point));
    try std.testing.expectEqual(.absent, try location.locate(256, .zero, 0, 1, full));
    point.end_included = false;
    try std.testing.expectError(error.EmptyIccInterval, location.locate(256, .zero, 0, 0, point));
}

test "power level locations preserve both roots and entire or inactive branches" {
    var curve = Curve{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 32768, 0 } };
    const result = try levels.inspect(256, curve, 65536);
    try std.testing.expectEqual(@as(usize, 2), result.roots.count);
    for (result.roots.entries[0..result.roots.count]) |entry| try std.testing.expectEqual(.interior, entry.location);
    curve.values[4] = 65537;
    try std.testing.expect((try levels.inspect(256, curve, 65536)) == .inactive);
    curve.values = .{ 0, 0, 65536, 0, 0, 32768, 0 };
    try std.testing.expect((try levels.inspect(256, curve, 98304)) == .entire);
    try std.testing.expectEqual(@as(usize, 0), (try levels.inspect(256, curve, 65536)).roots.count);
    curve.values[2] = 0;
    try std.testing.expectError(error.UndefinedIccCurvePower, levels.inspect(256, curve, 98304));
    curve.values = .{ 131072, 0, 32768, 0, 0, 0, 0 };
    try std.testing.expect((try levels.inspect(256, curve, 16384)) == .entire);
    try std.testing.expectEqual(@as(usize, 0), (try levels.inspect(256, curve, 65536)).roots.count);
}

test "affine root location resolves irrational root inside u64 Pell interval" {
    const root = level.solve(131072, 32768, 65536).finite.roots[0];
    const interval = Interval{ .start = .{ .numerator = 4866752642924153522, .denominator = 6882627592338442563 }, .end = .{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 } };
    try std.testing.expectEqual(.interior, try location.locate(256, root, 65536, 0, interval));
}
