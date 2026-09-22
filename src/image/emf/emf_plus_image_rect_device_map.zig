const geometry = @import("emf_plus_geometry.zig");
const image_affine_map = @import("emf_plus_image_affine_map.zig");
const image_source_device_map = @import("emf_plus_image_source_device_map.zig");
const rect_corners = @import("emf_plus_rect_corners.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub fn sourceToDestinationTransform(source: geometry.RectF, destination: rect_data.RectData) transform_matrix.TransformMatrix {
    const corners = rect_corners.fromRectData(destination);
    return image_affine_map.buildFromBasis(source, .{
        .upper_left = corners.upper_left,
        .upper_right = corners.upper_right,
        .lower_left = corners.lower_left,
    });
}

pub fn build(source: geometry.RectF, destination: rect_data.RectData, mapping: world_page_device.Mapper) image_source_device_map.Mapper {
    return image_source_device_map.fromTransform(sourceToDestinationTransform(source, destination), mapping);
}

const page_transform = @import("emf_plus_page_transform.zig");
const std = @import("std");

fn expectPoint(expected: geometry.PointF, actual: geometry.PointF) !void {
    try std.testing.expectApproxEqAbs(expected.x, actual.x, 0.0001);
    try std.testing.expectApproxEqAbs(expected.y, actual.y, 0.0001);
}

test "EMF+ image rectangle map sends source corners through destination world and device space" {
    const source: geometry.RectF = .{ .x = 10, .y = 20, .width = 4, .height = 5 };
    const destination: rect_data.RectData = .{ .compressed = .{ .x = 100, .y = 200, .width = 8, .height = 15 } };
    const world: transform_matrix.TransformMatrix = .{ .m11 = 2, .m12 = 3, .m21 = 5, .m22 = 7, .dx = 11, .dy = 13 };
    const page = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 });
    const mapper = build(source, destination, world_page_device.resolve(world, page).?);

    try expectPoint(.{ .x = 12110, .y = 171300 }, mapper.mapSourcePoint(.{ .x = 10, .y = 20 }));
    try expectPoint(.{ .x = 12270, .y = 173700 }, mapper.mapSourcePoint(.{ .x = 14, .y = 20 }));
    try expectPoint(.{ .x = 12860, .y = 181800 }, mapper.mapSourcePoint(.{ .x = 10, .y = 25 }));
    try expectPoint(.{ .x = 13020, .y = 184200 }, mapper.mapSourcePoint(.{ .x = 14, .y = 25 }));
}

test "EMF+ image rectangle affine map preserves negative and exceptional dimensions" {
    const source: geometry.RectF = .{ .x = 8, .y = 9, .width = -4, .height = -3 };
    const destination: rect_data.RectData = .{ .float = .{ .x = -2.5, .y = 7.25, .width = 8, .height = 12 } };
    const matrix = sourceToDestinationTransform(source, destination);
    try std.testing.expectEqual(@as(f32, -2), matrix.m11);
    try std.testing.expectEqual(@as(f32, -4), matrix.m22);
    try expectPoint(.{ .x = -2.5, .y = 7.25 }, matrix.mapPoint(.{ .x = 8, .y = 9 }));
    try expectPoint(.{ .x = 5.5, .y = 7.25 }, matrix.mapPoint(.{ .x = 4, .y = 9 }));
    try expectPoint(.{ .x = -2.5, .y = 19.25 }, matrix.mapPoint(.{ .x = 8, .y = 6 }));

    const exceptional = sourceToDestinationTransform(.{ .x = 1, .y = 2, .width = 0, .height = -0.0 }, destination);
    try std.testing.expect(std.math.isPositiveInf(exceptional.m11));
    try std.testing.expect(std.math.isNegativeInf(exceptional.m22));
}
