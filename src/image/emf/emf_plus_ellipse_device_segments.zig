const std = @import("std");
const arc_device_geometry = @import("emf_plus_arc_device_geometry.zig");
const arc_device_segments = @import("emf_plus_arc_device_segments.zig");
const ellipse_device_basis = @import("emf_plus_ellipse_device_basis.zig");

pub fn segments(ellipse: ellipse_device_basis.Basis) arc_device_segments.Iterator {
    const arc: arc_device_geometry.Arc = .{
        .ellipse = ellipse,
        .start_degrees = 0,
        .sweep_degrees = 360,
    };
    return arc_device_segments.segments(arc);
}

fn nextExpected(iterator: *arc_device_segments.Iterator) !arc_device_segments.Segment {
    return iterator.next() orelse error.TestExpectedEllipseSegment;
}

test "EMF+ Ellipse device segments reuse four exact connected arc quadrants" {
    const ellipse: ellipse_device_basis.Basis = .{
        .center = .{ .x = 10, .y = 20 },
        .horizontal_radius = .{ .x = 4, .y = 1 },
        .vertical_radius = .{ .x = -2, .y = 6 },
    };
    var iterator = segments(ellipse);
    const first = try nextExpected(&iterator);
    const second = try nextExpected(&iterator);
    const third = try nextExpected(&iterator);
    const fourth = try nextExpected(&iterator);
    try std.testing.expect(iterator.next() == null);

    try std.testing.expectEqual(@as(f32, 0), first.start_degrees);
    try std.testing.expectEqual(@as(f32, 90), second.start_degrees);
    try std.testing.expectEqual(@as(f32, 180), third.start_degrees);
    try std.testing.expectEqual(@as(f32, 270), fourth.start_degrees);
    inline for (.{ first, second, third, fourth }) |segment| {
        try std.testing.expectEqual(@as(f32, 90), segment.sweep_degrees);
        try std.testing.expectApproxEqAbs(@as(f32, @sqrt(0.5)), segment.control_weight, 0.000001);
    }
    try std.testing.expectEqual(first.end, second.start);
    try std.testing.expectEqual(second.end, third.start);
    try std.testing.expectEqual(third.end, fourth.start);
    try std.testing.expectEqual(fourth.end, first.start);
}

test "EMF+ Ellipse device segments preserve reversed and degenerate affine axes" {
    const ellipse: ellipse_device_basis.Basis = .{
        .center = .{ .x = 3, .y = -4 },
        .horizontal_radius = .{ .x = -2, .y = 1 },
        .vertical_radius = .{ .x = 0, .y = 0 },
    };
    var iterator = segments(ellipse);
    const first = try nextExpected(&iterator);
    _ = try nextExpected(&iterator);
    const third = try nextExpected(&iterator);
    const fourth = try nextExpected(&iterator);
    try std.testing.expectEqual(@as(f32, 1), first.start.x);
    try std.testing.expectEqual(@as(f32, -3), first.start.y);
    try std.testing.expectEqual(@as(f32, 5), third.start.x);
    try std.testing.expectEqual(@as(f32, -5), third.start.y);
    try std.testing.expectEqual(fourth.end, first.start);
    try std.testing.expect(iterator.next() == null);
}
