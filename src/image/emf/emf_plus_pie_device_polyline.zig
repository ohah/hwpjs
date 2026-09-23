const std = @import("std");
const arc_geometry = @import("emf_plus_arc_device_geometry.zig");
const arc_points = @import("emf_plus_arc_device_points.zig");
const arc_polyline = @import("emf_plus_arc_device_polyline.zig");
const arc_segments = @import("emf_plus_arc_device_segments.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const Options = arc_polyline.Options;
pub const Polyline = arc_polyline.Polyline;

pub fn collect(allocator: std.mem.Allocator, arc: arc_geometry.Arc, options: Options) !Polyline {
    try options.validate();
    if (!std.math.isFinite(arc.start_degrees) or arc.start_degrees < 0 or arc.start_degrees >= 360 or
        !std.math.isFinite(arc.sweep_degrees) or @abs(arc.sweep_degrees) > 360)
        return error.InvalidEmfPlusArcAngles;
    if (options.max_points < 3) return error.InvalidEmfPlusPiePointLimit;
    const radial = arc_points.pieRadialEdges(arc);
    inline for (.{ radial.center_to_start.start, radial.center_to_start.end, radial.end_to_center.start, radial.end_to_center.end }) |point| {
        if (!std.math.isFinite(point.x) or !std.math.isFinite(point.y))
            return error.InvalidEmfPlusArcCoordinate;
    }
    if (arc.sweep_degrees == 0) {
        if (!pointBitsEqual(radial.center_to_start.end, radial.end_to_center.start))
            return error.DiscontinuousEmfPlusPiePolyline;
        const points = try allocator.alloc(geometry.PointF, 3);
        points[0] = radial.center_to_start.start;
        points[1] = radial.center_to_start.end;
        points[2] = radial.end_to_center.end;
        return .{ .points = points };
    }
    if (options.max_points < 4) return error.EmfPlusArcPointLimitExceeded;
    var arc_options = options;
    arc_options.max_points -= 2;
    var curved = try arc_polyline.collect(allocator, arc_segments.segments(arc), arc_options);
    defer curved.deinit(allocator);
    if (curved.points.len < 2 or
        !pointBitsEqual(radial.center_to_start.end, curved.points[0]) or
        !pointBitsEqual(curved.points[curved.points.len - 1], radial.end_to_center.start))
        return error.DiscontinuousEmfPlusPiePolyline;

    const points = try allocator.alloc(geometry.PointF, curved.points.len + 2);
    points[0] = radial.center_to_start.start;
    @memcpy(points[1 .. 1 + curved.points.len], curved.points);
    points[points.len - 1] = radial.end_to_center.end;
    return .{ .points = points };
}

fn pointBitsEqual(left: geometry.PointF, right: geometry.PointF) bool {
    return @as(u32, @bitCast(left.x)) == @as(u32, @bitCast(right.x)) and
        @as(u32, @bitCast(left.y)) == @as(u32, @bitCast(right.y));
}

const affine_arc: arc_geometry.Arc = .{
    .ellipse = .{
        .center = .{ .x = 10, .y = 20 },
        .horizontal_radius = .{ .x = 4, .y = 1 },
        .vertical_radius = .{ .x = -2, .y = 6 },
    },
    .start_degrees = 45,
    .sweep_degrees = 200,
};

test "EMF+ Pie device polyline orders radial edges and adaptive arc for both sweep signs" {
    for ([_]f32{ 200, -200, 360, -360 }) |sweep| {
        var arc = affine_arc;
        arc.sweep_degrees = sweep;
        const radial = arc_points.pieRadialEdges(arc);
        var output = try collect(std.testing.allocator, arc, .{ .tolerance = 0.1, .max_depth = 16, .max_points = 1024 });
        defer output.deinit(std.testing.allocator);
        try std.testing.expect(output.points.len > 4);
        try std.testing.expectEqual(radial.center_to_start.start, output.points[0]);
        try std.testing.expectEqual(radial.center_to_start.end, output.points[1]);
        try std.testing.expectEqual(radial.end_to_center.start, output.points[output.points.len - 2]);
        try std.testing.expectEqual(radial.end_to_center.end, output.points[output.points.len - 1]);
        if (@abs(sweep) == 360)
            try std.testing.expectEqual(output.points[1], output.points[output.points.len - 2]);
    }
}

test "EMF+ Pie device polyline keeps zero sweep radial pair and validates global budget" {
    var arc = affine_arc;
    arc.sweep_degrees = 0;
    var output = try collect(std.testing.allocator, arc, .{ .tolerance = 0.1, .max_points = 3 });
    defer output.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 3), output.points.len);
    try std.testing.expectEqual(arc.ellipse.center, output.points[0]);
    try std.testing.expectEqual(arc.ellipse.center, output.points[2]);
    try std.testing.expectError(error.InvalidEmfPlusPiePointLimit, collect(std.testing.allocator, arc, .{ .tolerance = 0.1, .max_points = 2 }));
    try std.testing.expectError(error.EmfPlusArcPointLimitExceeded, collect(std.testing.allocator, affine_arc, .{ .tolerance = 0.1, .max_points = 3 }));
    try std.testing.expectError(error.EmfPlusArcPointLimitExceeded, collect(std.testing.allocator, affine_arc, .{ .tolerance = 0.1, .max_depth = 16, .max_points = 4 }));
    arc.start_degrees = std.math.nan(f32);
    try std.testing.expectError(error.InvalidEmfPlusArcAngles, collect(std.testing.allocator, arc, .{ .tolerance = 1 }));
    arc.start_degrees = 0;
    arc.sweep_degrees = std.math.inf(f32);
    try std.testing.expectError(error.InvalidEmfPlusArcAngles, collect(std.testing.allocator, arc, .{ .tolerance = 1 }));
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    var output = try collect(allocator, affine_arc, .{ .tolerance = 0.1, .max_depth = 16, .max_points = 1024 });
    defer output.deinit(allocator);
    try std.testing.expect(output.points.len > 4);
}

test "EMF+ Pie device polyline releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}
