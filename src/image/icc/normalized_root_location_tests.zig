const std = @import("std");
const location = @import("normalized_root_location.zig");
const levels = @import("normalized_level_locations.zig");
const level = @import("normalized_power_level.zig");
const Curve = @import("parametric_curve.zig").Curve;
const Interval = @import("unit_interval.zig").Interval;
const full = Interval{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 } };
test "normalized locations share endpoint ownership and reverse affine orientation" {
    const root = (try level.solve(65536, 0, 1, 1)).finite.roots[0];
    for ([_]bool{ false, true }) |start| for ([_]bool{ false, true }) |end| {
        var interval = full;
        interval.start_included = start;
        interval.end_included = end;
        try std.testing.expectEqual(if (end) location.Location.end else .absent, try location.locate(256, root, 65536, 0, interval));
        try std.testing.expectEqual(if (start) location.Location.start else .absent, try location.locate(256, root, -65536, 65536, interval));
    };
    var point = full;
    point.start = point.end;
    try std.testing.expectEqual(.singleton, try location.locate(128, root, 65536, 0, point));
    try std.testing.expectEqual(.entire, try location.locate(128, root, 0, 65536, point));
    point.end_included = false;
    try std.testing.expectError(error.EmptyIccInterval, location.locate(128, root, 0, 65536, point));
}
test "normalized locations retain uncertainty and wide radicands" {
    const root = (try level.solve(131072, 0, 1, 2)).finite.roots[0];
    const interval = Interval{ .start = .{ .numerator = 4866752642924153522, .denominator = 6882627592338442563 }, .end = .{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 } };
    try std.testing.expectEqual(.undecided, try location.locate(128, root, 65536, 0, interval));
    try std.testing.expectEqual(.interior, try location.locate(512, root, 65536, 0, interval));
    const max = std.math.maxInt(u128);
    const wide = (try level.solve(65536, 1, max / 2, max)).finite.roots[0];
    try std.testing.expectEqual(.interior, try location.locate(512, wide, 65536, 0, full));
}
test "normalized active levels preserve both roots constants and domain failures" {
    var curve = Curve{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 0, 0 } };
    const result = try levels.inspect(512, curve, 1, 3);
    try std.testing.expectEqual(@as(usize, 2), result.roots.count);
    for (result.roots.entries[0..result.roots.count]) |entry| try std.testing.expectEqual(.interior, entry.location);
    curve.values[4] = 65537;
    try std.testing.expect((try levels.inspect(128, curve, 1, 3)) == .inactive);
    try std.testing.expectError(error.InvalidIccCurveCoordinate, levels.inspect(128, curve, 1, 0));
    curve.values = .{ 0, 0, 65536, 0, 0, -32768, 0 };
    try std.testing.expect((try levels.inspect(128, curve, 1, 2)) == .entire);
    curve.values[2] = 0;
    try std.testing.expectError(error.UndefinedIccCurvePower, levels.inspect(128, curve, 1, 2));
}
