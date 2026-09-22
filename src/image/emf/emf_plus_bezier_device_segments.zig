const bezier = @import("emf_plus_bezier_segments.zig");
const cubic_derivative = @import("emf_plus_cubic_derivative.zig");
const cubic_evaluation = @import("emf_plus_cubic_evaluation.zig");
const cubic_flatness = @import("emf_plus_cubic_flatness.zig");
const cubic_flattening = @import("emf_plus_cubic_flattening.zig");
const cubic_subdivision = @import("emf_plus_cubic_subdivision.zig");
const geometry = @import("emf_plus_geometry.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const Segment = struct {
    start: geometry.PointF,
    control1: geometry.PointF,
    control2: geometry.PointF,
    end: geometry.PointF,

    pub fn pointAt(self: Segment, parameter: f32) !geometry.PointF {
        return cubic_evaluation.evaluate(self.cubic(), parameter);
    }

    pub fn splitAt(self: Segment, parameter: f32) !cubic_subdivision.Split {
        return cubic_subdivision.split(self.cubic(), parameter);
    }

    pub fn tangentAt(self: Segment, parameter: f32) !geometry.PointF {
        return cubic_derivative.evaluate(self.cubic(), parameter);
    }

    pub fn maximumControlDistanceSquared(self: Segment) !f64 {
        return cubic_flatness.maximumControlDistanceSquared(self.cubic());
    }

    pub fn flatten(self: Segment, allocator: @import("std").mem.Allocator, options: cubic_flattening.Options) !cubic_flattening.Polyline {
        return cubic_flattening.flatten(allocator, self.cubic(), options);
    }

    fn cubic(self: Segment) cubic_evaluation.Cubic {
        return .{
            .start = self.start,
            .control1 = self.control1,
            .control2 = self.control2,
            .end = self.end,
        };
    }
};

pub const Iterator = struct {
    source: bezier.Iterator,
    mapping: world_page_device.Mapper,

    pub fn next(self: *Iterator) !?Segment {
        var pending = self.*;
        const source_segment = try pending.source.next() orelse {
            self.* = pending;
            return null;
        };
        const result: Segment = .{
            .start = pending.mapping.mapResolved(source_segment.start),
            .control1 = pending.mapping.mapResolved(source_segment.control1),
            .control2 = pending.mapping.mapResolved(source_segment.control2),
            .end = pending.mapping.mapResolved(source_segment.end),
        };
        self.* = pending;
        return result;
    }
};

pub fn fromSegments(source: bezier.Iterator, mapping: world_page_device.Mapper) Iterator {
    return .{ .source = source, .mapping = mapping };
}

const page_transform = @import("emf_plus_page_transform.zig");
const point_data = @import("emf_plus_point_data.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const std = @import("std");

fn expectPoint(expected_x: f32, expected_y: f32, actual: geometry.PointF) !void {
    try std.testing.expectEqual(expected_x, actual.x);
    try std.testing.expectEqual(expected_y, actual.y);
}

test "EMF+ device Bezier segments preserve four roles connected endpoints and coordinate mapping" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 };
    const points = try point_data.parse(&bytes, 7, true, false, .{});
    const world: transform_matrix.TransformMatrix = .{ .m11 = 2, .m12 = 3, .m21 = 5, .m22 = 7, .dx = 11, .dy = 13 };
    const page = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 });
    var iterator = fromSegments(try bezier.segments(points), world_page_device.resolve(world, page).?);

    const first = (try iterator.next()).?;
    try expectPoint(230, 3000, first.start);
    try expectPoint(490, 6700, first.control1);
    try expectPoint(890, 12400, first.control2);
    try expectPoint(1430, 20100, first.end);
    try std.testing.expectEqual(try cubic_evaluation.evaluate(.{ .start = first.start, .control1 = first.control1, .control2 = first.control2, .end = first.end }, 0.25), try first.pointAt(0.25));
    const split = try first.splitAt(0.25);
    try std.testing.expectEqual(try first.pointAt(0.25), split.left.end);
    try std.testing.expectEqual(split.left.end, split.right.start);
    try std.testing.expectEqual(try cubic_derivative.evaluate(first.cubic(), 0.25), try first.tangentAt(0.25));
    try std.testing.expectEqual(try cubic_flatness.maximumControlDistanceSquared(first.cubic()), try first.maximumControlDistanceSquared());
    var curved = first;
    curved.control1.y += 100;
    var polyline = try curved.flatten(std.testing.allocator, .{ .tolerance = 1, .max_depth = 16, .max_points = 128 });
    defer polyline.deinit(std.testing.allocator);
    var expected_polyline = try cubic_flattening.flatten(std.testing.allocator, curved.cubic(), .{ .tolerance = 1, .max_depth = 16, .max_points = 128 });
    defer expected_polyline.deinit(std.testing.allocator);
    try std.testing.expectEqualSlices(geometry.PointF, expected_polyline.points, polyline.points);
    try std.testing.expect(polyline.points.len > 2);
    try std.testing.expectEqual(curved.start, polyline.points[0]);
    try std.testing.expectEqual(curved.end, polyline.points[polyline.points.len - 1]);
    const second = (try iterator.next()).?;
    try std.testing.expectEqual(first.end, second.start);
    try expectPoint(2110, 29800, second.control1);
    try expectPoint(2930, 41500, second.control2);
    try expectPoint(3890, 55200, second.end);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ device Bezier segments keep incomplete source groups atomic" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const points = try point_data.parse(&bytes, 4, true, false, .{});
    const page = page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 });
    var iterator = fromSegments(try bezier.segments(points), world_page_device.resolve(transform_matrix.TransformMatrix.identity, page).?);
    iterator.source.source.source.reader.bytes = bytes[0..7];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
}
