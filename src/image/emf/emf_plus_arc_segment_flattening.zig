const std = @import("std");
const arc_segments = @import("emf_plus_arc_device_segments.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const Options = struct {
    tolerance: f64,
    max_depth: u8 = 32,
    max_points: usize = 1_000_000,

    pub fn validate(self: Options) !void {
        if (!std.math.isFinite(self.tolerance) or self.tolerance <= 0)
            return error.InvalidEmfPlusArcTolerance;
        if (self.max_depth > 64) return error.InvalidEmfPlusArcDepthLimit;
        if (self.max_points < 2) return error.InvalidEmfPlusArcPointLimit;
    }
};

pub const Polyline = struct {
    points: []geometry.PointF,

    pub fn deinit(self: *Polyline, allocator: std.mem.Allocator) void {
        allocator.free(self.points);
        self.* = undefined;
    }
};

const Homogeneous = struct {
    x: f64,
    y: f64,
    w: f64,

    fn fromPoint(value: geometry.PointF, weight: f64) Homogeneous {
        return .{ .x = @as(f64, value.x) * weight, .y = @as(f64, value.y) * weight, .w = weight };
    }

    fn midpoint(left: Homogeneous, right: Homogeneous) Homogeneous {
        return .{ .x = (left.x + right.x) * 0.5, .y = (left.y + right.y) * 0.5, .w = (left.w + right.w) * 0.5 };
    }

    fn point(self: Homogeneous) geometry.PointF {
        return .{ .x = @floatCast(self.x / self.w), .y = @floatCast(self.y / self.w) };
    }
};

const Curve = struct {
    start: Homogeneous,
    control: Homogeneous,
    end: Homogeneous,

    fn split(self: Curve) struct { left: Curve, right: Curve } {
        const first = Homogeneous.midpoint(self.start, self.control);
        const second = Homogeneous.midpoint(self.control, self.end);
        const middle = Homogeneous.midpoint(first, second);
        return .{
            .left = .{ .start = self.start, .control = first, .end = middle },
            .right = .{ .start = middle, .control = second, .end = self.end },
        };
    }

    fn maximumDistanceSquared(self: Curve) f64 {
        const sx = self.start.x / self.start.w;
        const sy = self.start.y / self.start.w;
        const cx = self.control.x / self.control.w;
        const cy = self.control.y / self.control.w;
        const ex = self.end.x / self.end.w;
        const ey = self.end.y / self.end.w;
        const dx = ex - sx;
        const dy = ey - sy;
        const length_squared = dx * dx + dy * dy;
        const projection = if (length_squared == 0) 0 else std.math.clamp(((cx - sx) * dx + (cy - sy) * dy) / length_squared, 0, 1);
        const distance_x = cx - (sx + projection * dx);
        const distance_y = cy - (sy + projection * dy);
        return distance_x * distance_x + distance_y * distance_y;
    }
};

const Work = struct {
    curve: Curve,
    depth: u8,
};

pub fn flatten(allocator: std.mem.Allocator, segment: arc_segments.Segment, options: Options) !Polyline {
    try options.validate();
    if (!std.math.isFinite(segment.control_weight) or segment.control_weight <= 0 or segment.control_weight > 1)
        return error.InvalidEmfPlusArcControlWeight;
    inline for (.{ segment.start, segment.control, segment.end }) |point| {
        if (!std.math.isFinite(point.x) or !std.math.isFinite(point.y))
            return error.InvalidEmfPlusArcCoordinate;
    }

    const root: Curve = .{
        .start = Homogeneous.fromPoint(segment.start, 1),
        .control = Homogeneous.fromPoint(segment.control, segment.control_weight),
        .end = Homogeneous.fromPoint(segment.end, 1),
    };
    const tolerance_squared = options.tolerance * options.tolerance;
    var points: std.ArrayList(geometry.PointF) = .empty;
    defer points.deinit(allocator);
    try points.ensureTotalCapacity(allocator, @min(options.max_points, 16));
    try points.append(allocator, segment.start);

    var work: std.ArrayList(Work) = .empty;
    defer work.deinit(allocator);
    try work.ensureTotalCapacity(allocator, @as(usize, options.max_depth) + 1);
    try work.append(allocator, .{ .curve = root, .depth = 0 });

    while (work.pop()) |current| {
        if (current.curve.maximumDistanceSquared() <= tolerance_squared) {
            if (points.items.len == options.max_points) return error.EmfPlusArcPointLimitExceeded;
            const point = if (current.curve.end.w == 1 and current.depth == 0) segment.end else current.curve.end.point();
            try points.append(allocator, point);
            continue;
        }
        if (current.depth == options.max_depth) return error.EmfPlusArcDepthLimitExceeded;
        const split = current.curve.split();
        const next_depth = current.depth + 1;
        try work.append(allocator, .{ .curve = split.right, .depth = next_depth });
        try work.append(allocator, .{ .curve = split.left, .depth = next_depth });
    }
    // Preserve the exact source endpoint, including the sign of zero.
    points.items[points.items.len - 1] = segment.end;
    return .{ .points = try points.toOwnedSlice(allocator) };
}

const evaluation = @import("emf_plus_arc_segment_evaluation.zig");

fn sampleDistanceSquared(point: geometry.PointF, start: geometry.PointF, end: geometry.PointF) f64 {
    const px: f64 = point.x;
    const py: f64 = point.y;
    const sx: f64 = start.x;
    const sy: f64 = start.y;
    const ex: f64 = end.x;
    const ey: f64 = end.y;
    const dx = ex - sx;
    const dy = ey - sy;
    const length_squared = dx * dx + dy * dy;
    const projection = if (length_squared == 0) 0 else std.math.clamp(((px - sx) * dx + (py - sy) * dy) / length_squared, 0, 1);
    const nearest_x = sx + projection * dx;
    const nearest_y = sy + projection * dy;
    return (px - nearest_x) * (px - nearest_x) + (py - nearest_y) * (py - nearest_y);
}

const quarter: arc_segments.Segment = .{
    .start = .{ .x = 10, .y = 0 },
    .control = .{ .x = 10, .y = 10 },
    .end = .{ .x = 0, .y = 10 },
    .control_weight = @sqrt(0.5),
    .start_degrees = 0,
    .sweep_degrees = 90,
};

test "EMF+ rational arc flattening bounds sampled distance and keeps endpoint order" {
    var polyline = try flatten(std.testing.allocator, quarter, .{ .tolerance = 0.1, .max_depth = 16, .max_points = 128 });
    defer polyline.deinit(std.testing.allocator);
    try std.testing.expect(polyline.points.len > 2);
    try std.testing.expectEqual(quarter.start, polyline.points[0]);
    try std.testing.expectEqual(quarter.end, polyline.points[polyline.points.len - 1]);
    for (polyline.points[1..], polyline.points[0 .. polyline.points.len - 1]) |point, previous| {
        try std.testing.expect(point.x <= previous.x);
        try std.testing.expect(point.y >= previous.y);
    }
    for (0..257) |index| {
        const parameter: f32 = @as(f32, @floatFromInt(index)) / 256;
        const sample = try evaluation.evaluate(quarter, parameter);
        var minimum = std.math.inf(f64);
        for (polyline.points[0 .. polyline.points.len - 1], polyline.points[1..]) |start, end|
            minimum = @min(minimum, sampleDistanceSquared(sample, start, end));
        try std.testing.expect(minimum <= 0.01 + 0.00001);
    }
}

test "EMF+ rational arc flattening distinguishes collinear overshoot and preserves endpoint bits" {
    var line = quarter;
    line.start = .{ .x = -0.0, .y = 0 };
    line.control = .{ .x = 5, .y = 0 };
    line.end = .{ .x = 10, .y = -0.0 };
    line.control_weight = 1;
    var flat = try flatten(std.testing.allocator, line, .{ .tolerance = 0.01 });
    defer flat.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), flat.points.len);
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(flat.points[0].x)));
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(flat.points[1].y)));

    line.control = .{ .x = -10, .y = 0 };
    line.control_weight = 0.5;
    var overshoot = try flatten(std.testing.allocator, line, .{ .tolerance = 0.01, .max_depth = 16, .max_points = 128 });
    defer overshoot.deinit(std.testing.allocator);
    try std.testing.expect(overshoot.points.len > 2);
    var before_start = false;
    for (overshoot.points) |point| before_start = before_start or point.x < 0;
    try std.testing.expect(before_start);
}

test "EMF+ rational arc flattening validates options coordinates and budgets" {
    for ([_]f64{ 0, -1, std.math.nan(f64), std.math.inf(f64) }) |tolerance|
        try std.testing.expectError(error.InvalidEmfPlusArcTolerance, flatten(std.testing.allocator, quarter, .{ .tolerance = tolerance }));
    try std.testing.expectError(error.InvalidEmfPlusArcDepthLimit, flatten(std.testing.allocator, quarter, .{ .tolerance = 1, .max_depth = 65 }));
    try std.testing.expectError(error.InvalidEmfPlusArcPointLimit, flatten(std.testing.allocator, quarter, .{ .tolerance = 1, .max_points = 1 }));
    try std.testing.expectError(error.EmfPlusArcDepthLimitExceeded, flatten(std.testing.allocator, quarter, .{ .tolerance = 0.01, .max_depth = 0 }));
    try std.testing.expectError(error.EmfPlusArcPointLimitExceeded, flatten(std.testing.allocator, quarter, .{ .tolerance = 0.01, .max_points = 2 }));
    var invalid = quarter;
    invalid.control.x = std.math.nan(f32);
    try std.testing.expectError(error.InvalidEmfPlusArcCoordinate, flatten(std.testing.allocator, invalid, .{ .tolerance = 1 }));
    invalid = quarter;
    invalid.control_weight = 0;
    try std.testing.expectError(error.InvalidEmfPlusArcControlWeight, flatten(std.testing.allocator, invalid, .{ .tolerance = 1 }));
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    var polyline = try flatten(allocator, quarter, .{ .tolerance = 0.01, .max_depth = 16, .max_points = 128 });
    defer polyline.deinit(allocator);
    try std.testing.expect(polyline.points.len > 2);
}

test "EMF+ rational arc flattening releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}
