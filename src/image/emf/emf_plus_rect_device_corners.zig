const rect_array = @import("emf_plus_rect_array.zig");
const rect_corners = @import("emf_plus_rect_corners.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const Iterator = struct {
    source: rect_array.Iterator,
    mapping: world_page_device.Mapper,

    pub fn next(self: *Iterator) !?rect_corners.Corners {
        const rectangle = try self.source.next() orelse return null;
        return map(rectangle, self.mapping);
    }
};

pub fn map(value: rect_data.RectData, mapping: world_page_device.Mapper) rect_corners.Corners {
    const source = rect_corners.fromRectData(value);
    return .{
        .upper_left = mapping.mapPoint(source.upper_left),
        .upper_right = mapping.mapPoint(source.upper_right),
        .lower_left = mapping.mapPoint(source.lower_left),
        .lower_right = mapping.mapPoint(source.lower_right),
    };
}

pub fn fromRectArray(source: rect_array.RectArray, mapping: world_page_device.Mapper) Iterator {
    return .{ .source = source.rectangles(), .mapping = mapping };
}

const page_transform = @import("emf_plus_page_transform.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const std = @import("std");

fn expectPoint(expected_x: f32, expected_y: f32, actual: @import("emf_plus_geometry.zig").PointF) !void {
    try std.testing.expectEqual(expected_x, actual.x);
    try std.testing.expectEqual(expected_y, actual.y);
}

test "EMF+ rectangle device corners preserve four roles through shared mapping" {
    const world: transform_matrix.TransformMatrix = .{
        .m11 = 2,
        .m12 = 3,
        .m21 = 5,
        .m22 = 7,
        .dx = 11,
        .dy = 13,
    };
    const page = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 });
    const result = map(
        .{ .float = .{ .x = 1, .y = 2, .width = 3, .height = 4 } },
        world_page_device.resolve(world, page).?,
    );
    try expectPoint(230, 3000, result.upper_left);
    try expectPoint(290, 3900, result.upper_right);
    try expectPoint(430, 5800, result.lower_left);
    try expectPoint(490, 6700, result.lower_right);
}

test "EMF+ rectangle device iterator preserves order termination and source errors atomically" {
    var bytes = [_]u8{0} ** 16;
    for ([_]i16{ 1, 2, 3, 4, -5, -6, -7, -8 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, bytes[index * 2 ..][0..2], coordinate, .little);
    const source = try rect_array.parse(&bytes, 2, true, .{});
    const world: transform_matrix.TransformMatrix = .{
        .m11 = 2,
        .m12 = 3,
        .m21 = 5,
        .m22 = 7,
        .dx = 11,
        .dy = 13,
    };
    const mapping = world_page_device.resolve(world, page_transform.build(.inch, 2, .{ .x = 5, .y = 50 })).?;
    var iterator = fromRectArray(source, mapping);
    const first = (try iterator.next()).?;
    try expectPoint(230, 3000, first.upper_left);
    try expectPoint(490, 6700, first.lower_right);
    const second = (try iterator.next()).?;
    try expectPoint(-290, -4400, second.upper_left);
    try expectPoint(-830, -12100, second.lower_right);
    try std.testing.expect((try iterator.next()) == null);

    var truncated = fromRectArray(source, mapping);
    truncated.source.reader.bytes = bytes[0..7];
    const before = truncated;
    try std.testing.expectError(error.UnexpectedEnd, truncated.next());
    try std.testing.expectEqualDeep(before, truncated);

    var float_bytes = [_]u8{0} ** 16;
    const float_source = try rect_array.parse(&float_bytes, 1, false, .{});
    var truncated_float = fromRectArray(float_source, mapping);
    truncated_float.source.reader.bytes = float_bytes[0..15];
    const float_before = truncated_float;
    try std.testing.expectError(error.UnexpectedEnd, truncated_float.next());
    try std.testing.expectEqualDeep(float_before, truncated_float);
}
