const std = @import("std");
const cubic_flattening = @import("emf_plus_cubic_flattening.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const Polyline = cubic_flattening.Polyline;
pub const Options = cubic_flattening.Options;

pub fn flattenConnected(allocator: std.mem.Allocator, source: anytype, options: Options) !Polyline {
    try options.validate();
    var iterator = source;
    var points: std.ArrayList(geometry.PointF) = .empty;
    defer points.deinit(allocator);
    var segments: usize = 0;

    while (try iterator.next()) |segment| {
        const remaining = options.max_points - points.items.len;
        const segment_limit = if (points.items.len == 0) options.max_points else @max(@as(usize, 2), remaining + 1);
        var flattened = try segment.flatten(allocator, .{
            .tolerance = options.tolerance,
            .max_depth = options.max_depth,
            .max_points = segment_limit,
        });
        defer flattened.deinit(allocator);

        const first_segment = points.items.len == 0;
        if (!first_segment and !pointBitsEqual(points.items[points.items.len - 1], flattened.points[0]))
            return error.DiscontinuousEmfPlusBezierSequence;
        const append_points = if (first_segment) flattened.points else flattened.points[1..];
        for (append_points) |point| {
            if (!first_segment and points.items.len != 0 and pointBitsEqual(points.items[points.items.len - 1], point)) continue;
            if (points.items.len == options.max_points) return error.EmfPlusCubicPointLimitExceeded;
            try points.append(allocator, point);
        }
        segments += 1;
    }
    if (segments == 0) return error.EmptyEmfPlusBezierSequence;
    return .{ .points = try points.toOwnedSlice(allocator) };
}

fn pointBitsEqual(left: geometry.PointF, right: geometry.PointF) bool {
    return @as(u32, @bitCast(left.x)) == @as(u32, @bitCast(right.x)) and
        @as(u32, @bitCast(left.y)) == @as(u32, @bitCast(right.y));
}

const device_segments = @import("emf_plus_bezier_device_segments.zig");

const TestIterator = struct {
    segments: []const device_segments.Segment,
    index: usize = 0,
    fail_at: ?usize = null,

    pub fn next(self: *TestIterator) !?device_segments.Segment {
        if (self.fail_at == self.index) return error.TestIteratorFailure;
        if (self.index == self.segments.len) return null;
        defer self.index += 1;
        return self.segments[self.index];
    }
};

fn fixture() [3]device_segments.Segment {
    return .{
        .{
            .start = .{ .x = 0, .y = 0 },
            .control1 = .{ .x = 0, .y = 8 },
            .control2 = .{ .x = 8, .y = 8 },
            .end = .{ .x = 8, .y = 0 },
        },
        .{
            .start = .{ .x = 8, .y = 0 },
            .control1 = .{ .x = 8, .y = -8 },
            .control2 = .{ .x = 16, .y = -8 },
            .end = .{ .x = 16, .y = 0 },
        },
        .{
            .start = .{ .x = 16, .y = 0 },
            .control1 = .{ .x = 16, .y = 0 },
            .control2 = .{ .x = 16, .y = 0 },
            .end = .{ .x = 16, .y = 0 },
        },
    };
}

test "EMF+ connected Bezier flattening preserves order and stores shared endpoints once" {
    const segments = fixture();
    const options: Options = .{ .tolerance = 0.5, .max_depth = 8, .max_points = 128 };
    var actual = try flattenConnected(std.testing.allocator, TestIterator{ .segments = &segments }, options);
    defer actual.deinit(std.testing.allocator);

    var first = try segments[0].flatten(std.testing.allocator, options);
    defer first.deinit(std.testing.allocator);
    var second = try segments[1].flatten(std.testing.allocator, options);
    defer second.deinit(std.testing.allocator);
    try std.testing.expectEqual(first.points.len + second.points.len - 1, actual.points.len);
    try std.testing.expectEqualSlices(geometry.PointF, first.points, actual.points[0..first.points.len]);
    try std.testing.expectEqualSlices(geometry.PointF, second.points[1..], actual.points[first.points.len..]);
    var joint_count: usize = 0;
    for (actual.points) |point| joint_count += @intFromBool(pointBitsEqual(point, segments[0].end));
    try std.testing.expectEqual(@as(usize, 1), joint_count);
    try std.testing.expect(pointBitsEqual(segments[0].start, actual.points[0]));
    try std.testing.expect(pointBitsEqual(segments[1].end, actual.points[actual.points.len - 1]));
}

test "EMF+ connected Bezier flattening enforces continuity global point budget and input errors" {
    const segments = fixture();
    const options: Options = .{ .tolerance = 0.5, .max_depth = 8, .max_points = 128 };
    var baseline = try flattenConnected(std.testing.allocator, TestIterator{ .segments = segments[0..2] }, options);
    defer baseline.deinit(std.testing.allocator);
    var exact = try flattenConnected(std.testing.allocator, TestIterator{ .segments = segments[0..2] }, .{
        .tolerance = options.tolerance,
        .max_depth = options.max_depth,
        .max_points = baseline.points.len,
    });
    defer exact.deinit(std.testing.allocator);
    try std.testing.expectEqualSlices(geometry.PointF, baseline.points, exact.points);
    var one_split = try flattenConnected(std.testing.allocator, TestIterator{ .segments = segments[0..1] }, .{
        .tolerance = 3,
        .max_depth = 1,
        .max_points = 8,
    });
    defer one_split.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 3), one_split.points.len);
    try std.testing.expectError(error.EmfPlusCubicPointLimitExceeded, flattenConnected(std.testing.allocator, TestIterator{ .segments = segments[0..2] }, .{
        .tolerance = options.tolerance,
        .max_depth = options.max_depth,
        .max_points = baseline.points.len - 1,
    }));
    const exhausted = [_]device_segments.Segment{
        .{
            .start = .{ .x = 0, .y = 0 },
            .control1 = .{ .x = 0, .y = 0 },
            .control2 = .{ .x = 0, .y = 0 },
            .end = .{ .x = 0, .y = 0 },
        },
        .{
            .start = .{ .x = 0, .y = 0 },
            .control1 = .{ .x = 0, .y = 0 },
            .control2 = .{ .x = 1, .y = 0 },
            .end = .{ .x = 1, .y = 0 },
        },
    };
    try std.testing.expectError(error.EmfPlusCubicPointLimitExceeded, flattenConnected(std.testing.allocator, TestIterator{ .segments = &exhausted }, .{
        .tolerance = 1,
        .max_depth = 1,
        .max_points = 2,
    }));

    var disconnected = segments;
    disconnected[1].start.x = 9;
    try std.testing.expectError(error.DiscontinuousEmfPlusBezierSequence, flattenConnected(std.testing.allocator, TestIterator{ .segments = disconnected[0..2] }, options));
    disconnected = segments;
    disconnected[1].start.y = 1;
    try std.testing.expectError(error.DiscontinuousEmfPlusBezierSequence, flattenConnected(std.testing.allocator, TestIterator{ .segments = disconnected[0..2] }, options));
    disconnected = segments;
    disconnected[0].end.x = 0.0;
    disconnected[1].start.x = -0.0;
    try std.testing.expectError(error.DiscontinuousEmfPlusBezierSequence, flattenConnected(std.testing.allocator, TestIterator{ .segments = disconnected[0..2] }, options));
    try std.testing.expectError(error.EmptyEmfPlusBezierSequence, flattenConnected(std.testing.allocator, TestIterator{ .segments = &.{} }, options));
    try std.testing.expectError(error.TestIteratorFailure, flattenConnected(std.testing.allocator, TestIterator{ .segments = segments[0..2], .fail_at = 1 }, options));
    try std.testing.expectError(error.InvalidEmfPlusCubicTolerance, flattenConnected(std.testing.allocator, TestIterator{ .segments = &.{} }, .{ .tolerance = 0 }));

    var degenerate = try flattenConnected(std.testing.allocator, TestIterator{ .segments = segments[2..3] }, options);
    defer degenerate.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), degenerate.points.len);
    try std.testing.expect(pointBitsEqual(degenerate.points[0], degenerate.points[1]));
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    const segments = fixture();
    var polyline = try flattenConnected(allocator, TestIterator{ .segments = &segments }, .{ .tolerance = 0.1, .max_depth = 16, .max_points = 512 });
    defer polyline.deinit(allocator);
    try std.testing.expect(polyline.points.len > 3);
}

test "EMF+ connected Bezier flattening releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}
