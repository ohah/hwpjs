const geometry = @import("emf_plus_geometry.zig");
const polyline = @import("emf_plus_polyline_segments.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const Segment = struct {
    start: geometry.PointF,
    end: geometry.PointF,
};

pub const Iterator = struct {
    source: polyline.Iterator,
    mapping: world_page_device.Mapper,

    pub fn next(self: *Iterator) !?Segment {
        var pending = self.*;
        const source_segment = try pending.source.next() orelse {
            self.* = pending;
            return null;
        };
        const result: Segment = .{
            .start = pending.mapping.mapPoint(resolved.toPointF(source_segment.start)),
            .end = pending.mapping.mapPoint(resolved.toPointF(source_segment.end)),
        };
        self.* = pending;
        return result;
    }
};

pub fn fromSegments(source: polyline.Iterator, mapping: world_page_device.Mapper) Iterator {
    return .{ .source = source, .mapping = mapping };
}

const point_data = @import("emf_plus_point_data.zig");
const page_transform = @import("emf_plus_page_transform.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const std = @import("std");

fn expectPoint(expected_x: f32, expected_y: f32, actual: geometry.PointF) !void {
    try std.testing.expectEqual(expected_x, actual.x);
    try std.testing.expectEqual(expected_y, actual.y);
}

test "EMF+ device polyline segments preserve topology and apply the shared coordinate mapping" {
    const bytes = [_]u8{ 1, 2, 3, 4, 0x7f, 0x40 };
    const points = try point_data.parse(&bytes, 3, true, false, .{});
    const world: transform_matrix.TransformMatrix = .{ .m11 = 2, .m12 = 3, .m21 = 5, .m22 = 7, .dx = 11, .dy = 13 };
    const page = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 });
    var iterator = fromSegments(polyline.segments(points, true), world_page_device.resolve(world, page).?);

    const first = (try iterator.next()).?;
    try expectPoint(230, 3000, first.start);
    try expectPoint(490, 6700, first.end);
    const second = (try iterator.next()).?;
    try expectPoint(490, 6700, second.start);
    try expectPoint(-2730, -38400, second.end);
    const closing = (try iterator.next()).?;
    try expectPoint(-2730, -38400, closing.start);
    try expectPoint(230, 3000, closing.end);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ device polyline segments keep source errors atomic" {
    const bytes = [_]u8{ 1, 2, 3, 4 };
    const points = try point_data.parse(&bytes, 2, true, false, .{});
    const mapping = world_page_device.resolve(transform_matrix.TransformMatrix.identity, page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 })).?;
    var iterator = fromSegments(polyline.segments(points, false), mapping);
    iterator.source.source.source.reader.bytes = bytes[0..3];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
}
