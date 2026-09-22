const cardinal = @import("emf_plus_cardinal_spans.zig");
const geometry = @import("emf_plus_geometry.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const Span = struct {
    start: geometry.PointF,
    end: geometry.PointF,
};

pub const Iterator = struct {
    source: cardinal.Iterator,
    mapping: world_page_device.Mapper,

    pub fn next(self: *Iterator) !?Span {
        var pending = self.*;
        const source_span = try pending.source.next() orelse {
            self.* = pending;
            return null;
        };
        const result: Span = .{
            .start = pending.mapping.mapResolved(source_span.start),
            .end = pending.mapping.mapResolved(source_span.end),
        };
        self.* = pending;
        return result;
    }
};

pub fn fromSpans(source: cardinal.Iterator, mapping: world_page_device.Mapper) Iterator {
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

fn expectNext(iterator: *Iterator) !Span {
    const value = try iterator.next();
    try std.testing.expect(value != null);
    return value.?;
}

test "EMF+ device cardinal spans preserve open selection closed topology and coordinate mapping" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const points = try point_data.parse(&bytes, 4, true, false, .{});
    const world: transform_matrix.TransformMatrix = .{ .m11 = 2, .m12 = 3, .m21 = 5, .m22 = 7, .dx = 11, .dy = 13 };
    const page = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 });
    const mapping = world_page_device.resolve(world, page).?;

    var open = fromSpans(try cardinal.open(points, 1, 2), mapping);
    const first = try expectNext(&open);
    try expectPoint(490, 6700, first.start);
    try expectPoint(890, 12400, first.end);
    const second = try expectNext(&open);
    try std.testing.expectEqual(first.end, second.start);
    try expectPoint(1430, 20100, second.end);
    try std.testing.expect((try open.next()) == null);

    var closed = fromSpans(try cardinal.closed(points), mapping);
    _ = try expectNext(&closed);
    _ = try expectNext(&closed);
    _ = try expectNext(&closed);
    const closing = try expectNext(&closed);
    try expectPoint(1430, 20100, closing.start);
    try expectPoint(230, 3000, closing.end);
    try std.testing.expect((try closed.next()) == null);
}

test "EMF+ device cardinal spans keep source errors atomic" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6 };
    const points = try point_data.parse(&bytes, 3, true, false, .{});
    const page = page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 });
    var iterator = fromSpans(try cardinal.open(points, 1, 1), world_page_device.resolve(transform_matrix.TransformMatrix.identity, page).?);
    iterator.source.source.source.reader.bytes = bytes[0..5];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
}
