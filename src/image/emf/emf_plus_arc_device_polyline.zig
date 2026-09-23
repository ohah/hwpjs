const std = @import("std");
const arc_segments = @import("emf_plus_arc_device_segments.zig");
const flattening = @import("emf_plus_arc_segment_flattening.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const Options = flattening.Options;
pub const Polyline = flattening.Polyline;

pub fn collect(allocator: std.mem.Allocator, source: arc_segments.Iterator, options: Options) !Polyline {
    try options.validate();
    if (!std.math.isFinite(source.next_degrees) or
        !std.math.isFinite(source.remaining_degrees) or
        @abs(source.remaining_degrees) > 360)
        return error.InvalidEmfPlusArcAngles;
    var iterator = source;
    var points: std.ArrayList(geometry.PointF) = .empty;
    defer points.deinit(allocator);
    while (iterator.next()) |segment|
        try appendSegment(allocator, &points, segment, options);
    return .{ .points = try points.toOwnedSlice(allocator) };
}

pub fn appendSegment(allocator: std.mem.Allocator, points: *std.ArrayList(geometry.PointF), segment: arc_segments.Segment, options: Options) !void {
    if (points.items.len > options.max_points) return error.EmfPlusArcPointLimitExceeded;
    const is_first = points.items.len == 0;
    const remaining = options.max_points - points.items.len;
    if (!is_first and remaining == 0) return error.EmfPlusArcPointLimitExceeded;
    if (!is_first and !pointBitsEqual(points.items[points.items.len - 1], segment.start))
        return error.DiscontinuousEmfPlusArcPolyline;
    var segment_options = options;
    segment_options.max_points = if (is_first) options.max_points else remaining + 1;
    var polyline = try flattening.flatten(allocator, segment, segment_options);
    defer polyline.deinit(allocator);
    if (is_first) {
        try points.appendSlice(allocator, polyline.points);
    } else {
        try points.appendSlice(allocator, polyline.points[1..]);
    }
}

fn pointBitsEqual(left: geometry.PointF, right: geometry.PointF) bool {
    return @as(u32, @bitCast(left.x)) == @as(u32, @bitCast(right.x)) and
        @as(u32, @bitCast(left.y)) == @as(u32, @bitCast(right.y));
}

const arc_geometry = @import("emf_plus_arc_device_geometry.zig");
const arc_points = @import("emf_plus_arc_device_points.zig");

const affine_arc: arc_geometry.Arc = .{
    .ellipse = .{
        .center = .{ .x = 10, .y = 20 },
        .horizontal_radius = .{ .x = 4, .y = 1 },
        .vertical_radius = .{ .x = -2, .y = 6 },
    },
    .start_degrees = 0,
    .sweep_degrees = 200,
};

test "EMF+ Arc device polyline joins negative and positive spans without duplicate joints" {
    for ([_]f32{ 200, -200, 360, -360 }) |sweep| {
        var arc = affine_arc;
        arc.sweep_degrees = sweep;
        var source = arc_segments.segments(arc);
        const first = source.next().?;
        var last = first;
        var count: usize = 1;
        while (source.next()) |segment| {
            last = segment;
            count += 1;
        }
        var output = try collect(std.testing.allocator, arc_segments.segments(arc), .{ .tolerance = 0.1, .max_depth = 16, .max_points = 1024 });
        defer output.deinit(std.testing.allocator);
        try std.testing.expect(output.points.len > count + 1);
        try std.testing.expectEqual(first.start, output.points[0]);
        try std.testing.expectEqual(last.end, output.points[output.points.len - 1]);
        if (@abs(sweep) == 360) try std.testing.expectEqual(first.start, last.end);
        var joint_count: usize = 0;
        for (output.points) |point| {
            if (pointBitsEqual(point, first.end)) joint_count += 1;
        }
        try std.testing.expectEqual(@as(usize, 1), joint_count);
    }
}

test "EMF+ Arc device polyline bounds sampled affine arc distance" {
    for ([_]f32{ 200, -200 }) |sweep| {
        var arc = affine_arc;
        arc.sweep_degrees = sweep;
        var output = try collect(std.testing.allocator, arc_segments.segments(arc), .{ .tolerance = 0.1, .max_depth = 16, .max_points = 1024 });
        defer output.deinit(std.testing.allocator);
        for (0..257) |index| {
            const fraction: f32 = @as(f32, @floatFromInt(index)) / 256;
            const point = arc_points.pointAtDegrees(arc.ellipse, arc.start_degrees + sweep * fraction);
            var minimum = std.math.inf(f64);
            for (output.points[0 .. output.points.len - 1], output.points[1..]) |start, end| {
                const sx: f64 = start.x;
                const sy: f64 = start.y;
                const ex: f64 = end.x;
                const ey: f64 = end.y;
                const px: f64 = point.x;
                const py: f64 = point.y;
                const dx = ex - sx;
                const dy = ey - sy;
                const length_squared = dx * dx + dy * dy;
                const projection = if (length_squared == 0) 0 else std.math.clamp(((px - sx) * dx + (py - sy) * dy) / length_squared, 0, 1);
                const distance_x = px - (sx + projection * dx);
                const distance_y = py - (sy + projection * dy);
                minimum = @min(minimum, distance_x * distance_x + distance_y * distance_y);
            }
            try std.testing.expect(minimum <= 0.01 + 0.0001);
        }
    }
}

test "EMF+ Arc device polyline preserves zero sweep and enforces global budget" {
    var empty = affine_arc;
    empty.sweep_degrees = 0;
    var output = try collect(std.testing.allocator, arc_segments.segments(empty), .{ .tolerance = 0.1 });
    defer output.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 0), output.points.len);
    try std.testing.expectError(error.EmfPlusArcPointLimitExceeded, collect(std.testing.allocator, arc_segments.segments(affine_arc), .{ .tolerance = 0.1, .max_depth = 16, .max_points = 3 }));
    var invalid = arc_segments.segments(affine_arc);
    invalid.remaining_degrees = std.math.inf(f32);
    try std.testing.expectError(error.InvalidEmfPlusArcAngles, collect(std.testing.allocator, invalid, .{ .tolerance = 1 }));
    invalid.remaining_degrees = std.math.nan(f32);
    try std.testing.expectError(error.InvalidEmfPlusArcAngles, collect(std.testing.allocator, invalid, .{ .tolerance = 1 }));
    invalid.remaining_degrees = 361;
    try std.testing.expectError(error.InvalidEmfPlusArcAngles, collect(std.testing.allocator, invalid, .{ .tolerance = 1 }));
}

test "EMF+ Arc device polyline refuses discontinuous source and releases failed append" {
    var source = arc_segments.segments(affine_arc);
    const first = source.next().?;
    const second = source.next().?;
    var points: std.ArrayList(geometry.PointF) = .empty;
    defer points.deinit(std.testing.allocator);
    const options: Options = .{ .tolerance = 0.1, .max_depth = 16, .max_points = 1024 };
    try appendSegment(std.testing.allocator, &points, first, options);
    const before = points.items.len;
    var broken = second;
    broken.start.x += 1;
    try std.testing.expectError(error.DiscontinuousEmfPlusArcPolyline, appendSegment(std.testing.allocator, &points, broken, options));
    try std.testing.expectEqual(before, points.items.len);
    try appendSegment(std.testing.allocator, &points, second, options);
    try std.testing.expect(points.items.len > before);
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    var output = try collect(allocator, arc_segments.segments(affine_arc), .{ .tolerance = 0.1, .max_depth = 16, .max_points = 1024 });
    defer output.deinit(allocator);
    try std.testing.expect(output.points.len > 4);
}

test "EMF+ Arc device polyline releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}
