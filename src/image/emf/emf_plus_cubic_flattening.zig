const std = @import("std");
const de_casteljau = @import("emf_plus_cubic_de_casteljau.zig");
const evaluation = @import("emf_plus_cubic_evaluation.zig");
const flatness = @import("emf_plus_cubic_flatness.zig");
const geometry = @import("emf_plus_geometry.zig");
const subdivision = @import("emf_plus_cubic_subdivision.zig");

pub const Options = struct {
    tolerance: f64,
    max_depth: u8 = 32,
    max_points: usize = 1_000_000,

    pub fn validate(self: Options) !void {
        if (!std.math.isFinite(self.tolerance) or self.tolerance <= 0)
            return error.InvalidEmfPlusCubicTolerance;
        if (self.max_depth > 64) return error.InvalidEmfPlusCubicDepthLimit;
        if (self.max_points < 2) return error.InvalidEmfPlusCubicPointLimit;
    }
};

pub const Polyline = struct {
    points: []geometry.PointF,

    pub fn deinit(self: *Polyline, allocator: std.mem.Allocator) void {
        allocator.free(self.points);
        self.* = undefined;
    }
};

const Work = struct {
    cubic: de_casteljau.Cubic,
    depth: u8,
};

pub fn flatten(allocator: std.mem.Allocator, cubic: de_casteljau.Cubic, options: Options) !Polyline {
    try options.validate();
    const tolerance_squared = options.tolerance * options.tolerance;
    _ = try flatness.maximumControlDistanceSquared(cubic);

    var points: std.ArrayList(geometry.PointF) = .empty;
    defer points.deinit(allocator);
    try points.ensureTotalCapacity(allocator, @min(options.max_points, 16));
    try points.append(allocator, cubic.start);

    var work: std.ArrayList(Work) = .empty;
    defer work.deinit(allocator);
    try work.ensureTotalCapacity(allocator, @as(usize, options.max_depth) + 1);
    try work.append(allocator, .{ .cubic = cubic, .depth = 0 });

    while (work.pop()) |current| {
        if (try flatness.maximumControlDistanceSquared(current.cubic) <= tolerance_squared) {
            if (points.items.len == options.max_points) return error.EmfPlusCubicPointLimitExceeded;
            try points.append(allocator, current.cubic.end);
            continue;
        }
        if (current.depth == options.max_depth) return error.EmfPlusCubicDepthLimitExceeded;
        const split = try subdivision.split(current.cubic, 0.5);
        const next_depth = current.depth + 1;
        try work.append(allocator, .{ .cubic = split.right, .depth = next_depth });
        try work.append(allocator, .{ .cubic = split.left, .depth = next_depth });
    }
    return .{ .points = try points.toOwnedSlice(allocator) };
}

fn expectPoint(expected: geometry.PointF, actual: geometry.PointF) !void {
    try std.testing.expectEqual(expected.x, actual.x);
    try std.testing.expectEqual(expected.y, actual.y);
}

fn sampleDistanceSquared(point: geometry.PointF, start: geometry.PointF, end: geometry.PointF) f64 {
    const px: f64 = @floatCast(point.x);
    const py: f64 = @floatCast(point.y);
    const sx: f64 = @floatCast(start.x);
    const sy: f64 = @floatCast(start.y);
    const ex: f64 = @floatCast(end.x);
    const ey: f64 = @floatCast(end.y);
    const dx = ex - sx;
    const dy = ey - sy;
    const length_squared = dx * dx + dy * dy;
    if (length_squared == 0) return (px - sx) * (px - sx) + (py - sy) * (py - sy);
    const projection = std.math.clamp(((px - sx) * dx + (py - sy) * dy) / length_squared, 0, 1);
    const nearest_x = sx + projection * dx;
    const nearest_y = sy + projection * dy;
    return (px - nearest_x) * (px - nearest_x) + (py - nearest_y) * (py - nearest_y);
}

test "EMF+ cubic adaptive flattening preserves order endpoints and tolerance bound" {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 0, .y = 8 },
        .control2 = .{ .x = 8, .y = 8 },
        .end = .{ .x = 8, .y = 0 },
    };
    var polyline = try flatten(std.testing.allocator, cubic, .{ .tolerance = 0.5, .max_depth = 8, .max_points = 64 });
    defer polyline.deinit(std.testing.allocator);
    try std.testing.expect(polyline.points.len > 2);
    try expectPoint(cubic.start, polyline.points[0]);
    try expectPoint(cubic.end, polyline.points[polyline.points.len - 1]);
    var midpoint_count: usize = 0;
    for (polyline.points) |point|
        midpoint_count += @intFromBool(point.x == 4 and point.y == 6);
    try std.testing.expectEqual(@as(usize, 1), midpoint_count);
    for (polyline.points[1..], polyline.points[0 .. polyline.points.len - 1]) |point, previous| {
        try std.testing.expect(point.x > previous.x);
        try std.testing.expect(point.x != previous.x or point.y != previous.y);
    }
    for (0..257) |index| {
        const parameter: f32 = @floatFromInt(index);
        const point = try evaluation.evaluate(cubic, parameter / 256.0);
        var minimum = std.math.inf(f64);
        for (polyline.points[0 .. polyline.points.len - 1], polyline.points[1..]) |start, end|
            minimum = @min(minimum, sampleDistanceSquared(point, start, end));
        try std.testing.expect(minimum <= 0.25 + 0.000001);
    }
}

test "EMF+ cubic adaptive flattening keeps flat and collinear overshooting curves distinct" {
    const flat: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 2, .y = 0 },
        .control2 = .{ .x = 8, .y = 0 },
        .end = .{ .x = 10, .y = 0 },
    };
    var line = try flatten(std.testing.allocator, flat, .{ .tolerance = 0.01 });
    defer line.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), line.points.len);
    try expectPoint(flat.start, line.points[0]);
    try expectPoint(flat.end, line.points[1]);

    const overshooting: de_casteljau.Cubic = .{
        .start = flat.start,
        .control1 = .{ .x = -4, .y = 0 },
        .control2 = .{ .x = 14, .y = 0 },
        .end = flat.end,
    };
    var overshoot = try flatten(std.testing.allocator, overshooting, .{ .tolerance = 0.01, .max_depth = 16, .max_points = 128 });
    defer overshoot.deinit(std.testing.allocator);
    try std.testing.expect(overshoot.points.len > 2);
    var before_start = false;
    var after_end = false;
    for (overshoot.points) |point| {
        before_start = before_start or point.x < 0;
        after_end = after_end or point.x > 10;
    }
    try std.testing.expect(before_start);
    try std.testing.expect(after_end);
}

test "EMF+ cubic adaptive flattening compares squared metric with squared tolerance" {
    const boundary: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 2, .y = 0.6 },
        .control2 = .{ .x = 8, .y = 0.6 },
        .end = .{ .x = 10, .y = 0 },
    };
    try std.testing.expect(try flatness.maximumControlDistanceSquared(boundary) > 0.25);
    try std.testing.expect(try flatness.maximumControlDistanceSquared(boundary) < 0.5);
    var polyline = try flatten(std.testing.allocator, boundary, .{ .tolerance = 0.5, .max_depth = 8, .max_points = 16 });
    defer polyline.deinit(std.testing.allocator);
    try std.testing.expect(polyline.points.len > 2);
}

test "EMF+ cubic adaptive flattening validates options coordinates depth and output limits" {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 0, .y = 8 },
        .control2 = .{ .x = 8, .y = 8 },
        .end = .{ .x = 8, .y = 0 },
    };
    for ([_]f64{ 0, -1, std.math.nan(f64), std.math.inf(f64), -std.math.inf(f64) }) |tolerance|
        try std.testing.expectError(error.InvalidEmfPlusCubicTolerance, flatten(std.testing.allocator, cubic, .{ .tolerance = tolerance }));
    try std.testing.expectError(error.InvalidEmfPlusCubicDepthLimit, flatten(std.testing.allocator, cubic, .{ .tolerance = 1, .max_depth = 65 }));
    try std.testing.expectError(error.InvalidEmfPlusCubicPointLimit, flatten(std.testing.allocator, cubic, .{ .tolerance = 1, .max_points = 1 }));
    try std.testing.expectError(error.EmfPlusCubicDepthLimitExceeded, flatten(std.testing.allocator, cubic, .{ .tolerance = 0.01, .max_depth = 0 }));
    try std.testing.expectError(error.EmfPlusCubicDepthLimitExceeded, flatten(std.testing.allocator, cubic, .{ .tolerance = 0.01, .max_depth = 1 }));
    try std.testing.expectError(error.EmfPlusCubicPointLimitExceeded, flatten(std.testing.allocator, cubic, .{ .tolerance = 1, .max_depth = 8, .max_points = 2 }));

    var invalid = cubic;
    invalid.control1.x = std.math.nan(f32);
    try std.testing.expectError(error.InvalidEmfPlusCubicCoordinate, flatten(std.testing.allocator, invalid, .{ .tolerance = 1 }));
    var no_memory: [0]u8 = .{};
    var fixed = std.heap.FixedBufferAllocator.init(&no_memory);
    try std.testing.expectError(error.InvalidEmfPlusCubicCoordinate, flatten(fixed.allocator(), invalid, .{ .tolerance = 1 }));
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    const cubic: de_casteljau.Cubic = .{
        .start = .{ .x = 0, .y = 0 },
        .control1 = .{ .x = 0, .y = 8 },
        .control2 = .{ .x = 8, .y = 8 },
        .end = .{ .x = 8, .y = 0 },
    };
    var polyline = try flatten(allocator, cubic, .{ .tolerance = 0.01, .max_depth = 16, .max_points = 1024 });
    defer polyline.deinit(allocator);
    try std.testing.expect(polyline.points.len > 2);
}

test "EMF+ cubic adaptive flattening releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}
