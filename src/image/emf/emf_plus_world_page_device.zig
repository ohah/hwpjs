const geometry = @import("emf_plus_geometry.zig");
const page_transform = @import("emf_plus_page_transform.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub fn mapPoint(world: ?transform_matrix.TransformMatrix, page: page_transform.PageTransform, point: geometry.PointF) ?geometry.PointF {
    const world_matrix = world orelse return null;
    const device_scale = page.device_scale orelse return null;
    const page_point = world_matrix.mapPoint(point);
    return .{
        .x = page_point.x * device_scale.x,
        .y = page_point.y * device_scale.y,
    };
}

const std = @import("std");

test "EMF+ world-page-device mapping applies world transform before asymmetric page scale" {
    const world: transform_matrix.TransformMatrix = .{
        .m11 = 2,
        .m12 = 3,
        .m21 = 5,
        .m22 = 7,
        .dx = 11,
        .dy = 13,
    };
    const page = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 });
    const device = mapPoint(world, page, .{ .x = 17, .y = 19 }).?;
    try std.testing.expectEqual(@as(f32, 1400), device.x);
    try std.testing.expectEqual(@as(f32, 19700), device.y);
}

test "EMF+ world-page-device mapping keeps unknown world and page transforms explicit" {
    const point: geometry.PointF = .{ .x = 1, .y = 2 };
    const pixel = page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 });
    try std.testing.expect(mapPoint(null, pixel, point) == null);
    try std.testing.expect(mapPoint(transform_matrix.TransformMatrix.identity, .{}, point) == null);
}

test "EMF+ world-page-device mapping preserves sequential IEEE arithmetic" {
    const special: transform_matrix.TransformMatrix = .{
        .m11 = 1,
        .m12 = std.math.inf(f32),
        .m21 = 0,
        .m22 = 1,
        .dx = -0.0,
        .dy = 0,
    };
    const page = page_transform.build(.pixel, -0.0, .{ .x = 0, .y = 0 });
    const device = mapPoint(special, page, .{ .x = 0, .y = 0 }).?;
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(device.x)));
    try std.testing.expect(std.math.isNan(device.y));
}
