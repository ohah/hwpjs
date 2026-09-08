const std = @import("std");
const t = std.testing;
const location = @import("normalized_root_location.zig").Wide;
const Location = @import("normalized_root_location.zig").Location;
const levels = @import("normalized_level_locations.zig");
const level = @import("normalized_power_level.zig");
const Curve = @import("parametric_curve.zig").Curve;
const Interval = @import("unit_interval.zig").Interval;
const full = Interval{ .start = .{ .numerator = 0, .denominator = 1 }, .end = .{ .numerator = 1, .denominator = 1 } };
test "extended locations share open endpoints slope reversal and singleton ownership" {
    const max = std.math.maxInt(u512);
    const root = (try level.solveWide(65536, 0, max, max)).finite.roots[0];
    for ([_]bool{ false, true }) |start| for ([_]bool{ false, true }) |end| {
        var interval = full;
        interval.start_included = start;
        interval.end_included = end;
        try t.expectEqual(if (end) Location.end else .absent, try location.locate(128, root, 65536, 0, interval));
        try t.expectEqual(if (start) Location.start else .absent, try location.locate(128, root, -65536, 65536, interval));
    };
    var point = full;
    point.start = point.end;
    try t.expectEqual(.singleton, try location.locate(128, root, 65536, 0, point));
    try t.expectEqual(.entire, try location.locate(128, root, 0, 65536, point));
    point.end_included = false;
    try t.expectError(error.EmptyIccInterval, location.locate(128, root, 0, 65536, point));
    const interior = (try level.solveWide(65536, 0, max / 2, max)).finite.roots[0];
    try t.expectEqual(.interior, try location.locate(1024, interior, -65536, 65536, full));
}
test "extended locations preserve wide target neighbors and uncertain bounds" {
    const max = std.math.maxInt(u512);
    for ([_]u512{ 1, max / 2, max - 1 }) |n| {
        const r = (try level.solveWide(65536, 0, n, max)).finite.roots[0];
        try t.expectEqual(.interior, try location.locate(1024, r, 65536, 0, full));
    }
    const r = (try level.solveWide(131072, 0, 1, 2)).finite.roots[0];
    const interval = Interval{ .start = .{ .numerator = 4866752642924153522, .denominator = 6882627592338442563 }, .end = .{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 } };
    try t.expectEqual(.undecided, try location.locate(128, r, 65536, 0, interval));
    try t.expectEqual(.interior, try location.locate(512, r, 65536, 0, interval));
}
test "extended active levels retain both roots and validate inactive inputs" {
    const max = std.math.maxInt(u512);
    var curve = Curve{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 0, 0 } };
    const result = try levels.inspectWide(1024, curve, max / 3, max);
    try t.expectEqual(@as(usize, 2), result.roots.count);
    for (result.roots.entries[0..result.roots.count]) |entry| try t.expectEqual(.interior, entry.location);
    curve.values[4] = 65537;
    try t.expect((try levels.inspectWide(128, curve, 1, max)) == .inactive);
    try t.expectError(error.InvalidIccCurveCoordinate, levels.inspectWide(128, curve, 1, 0));
    try t.expectError(error.InvalidIccCurveCoordinate, levels.inspectWide(128, curve, 2, 1));
}
test "extended constant branch entire result requires whole domain validation" {
    const d = std.math.maxInt(u512) - 1;
    var curve = Curve{ .function = .type4, .values = .{ 0, 0, 65536, 0, 0, -32768, 0 } };
    try t.expect((try levels.inspectWide(128, curve, d / 2, d)) == .entire);
    try t.expectEqual(@as(usize, 0), (try levels.inspectWide(128, curve, d / 2 + 1, d)).roots.count);
    curve.values[2] = 0;
    try t.expectError(error.UndefinedIccCurvePower, levels.inspectWide(128, curve, d / 2, d));
}
