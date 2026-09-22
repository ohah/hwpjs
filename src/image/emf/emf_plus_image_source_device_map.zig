const geometry = @import("emf_plus_geometry.zig");
const image_affine_map = @import("emf_plus_image_affine_map.zig");
const image_parallelogram = @import("emf_plus_image_parallelogram.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const Mapper = struct {
    source_to_world: transform_matrix.TransformMatrix,
    world_page_device: world_page_device.Mapper,

    pub fn mapSourcePoint(self: Mapper, point: geometry.PointF) geometry.PointF {
        return self.world_page_device.mapPoint(self.source_to_world.mapPoint(point));
    }
};

pub fn fromTransform(source_to_world: transform_matrix.TransformMatrix, mapping: world_page_device.Mapper) Mapper {
    return .{ .source_to_world = source_to_world, .world_page_device = mapping };
}

pub fn build(source: geometry.RectF, destination: image_parallelogram.Parallelogram, mapping: world_page_device.Mapper) Mapper {
    return fromTransform(image_affine_map.build(source, destination), mapping);
}

const page_transform = @import("emf_plus_page_transform.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");
const std = @import("std");

fn integerPoint(x: i64, y: i64) resolved.Value {
    return .{ .integer = .{ .x = x, .y = y } };
}

fn expectPoint(expected: geometry.PointF, actual: geometry.PointF) !void {
    try std.testing.expectApproxEqAbs(expected.x, actual.x, 0.0001);
    try std.testing.expectApproxEqAbs(expected.y, actual.y, 0.0001);
}

test "EMF+ image source device map preserves four destination roles and transform order" {
    const destination: image_parallelogram.Parallelogram = .{
        .upper_left = integerPoint(100, 200),
        .upper_right = integerPoint(108, 204),
        .lower_left = integerPoint(97, 215),
        .lower_right = integerPoint(105, 219),
    };
    const world: transform_matrix.TransformMatrix = .{ .m11 = 2, .m12 = 3, .m21 = 5, .m22 = 7, .dx = 11, .dy = 13 };
    const page = page_transform.build(.inch, 2, .{ .x = 5, .y = 50 });
    const mapper = build(.{ .x = 10, .y = 20, .width = 4, .height = 5 }, destination, world_page_device.resolve(world, page).?);

    try expectPoint(.{ .x = 12110, .y = 171300 }, mapper.mapSourcePoint(.{ .x = 10, .y = 20 }));
    try expectPoint(.{ .x = 12470, .y = 176500 }, mapper.mapSourcePoint(.{ .x = 14, .y = 20 }));
    try expectPoint(.{ .x = 12800, .y = 180900 }, mapper.mapSourcePoint(.{ .x = 10, .y = 25 }));
    try expectPoint(.{ .x = 13160, .y = 186100 }, mapper.mapSourcePoint(.{ .x = 14, .y = 25 }));
}

test "EMF+ image source device map keeps affine world and device arithmetic sequential" {
    const source_to_world: transform_matrix.TransformMatrix = .{ .m11 = 0.1, .m12 = 0.2, .m21 = 0.3, .m22 = 0.4, .dx = 0.5, .dy = 0.6 };
    const world: transform_matrix.TransformMatrix = .{ .m11 = 0.7, .m12 = 0.8, .m21 = 0.9, .m22 = 1.1, .dx = 1.2, .dy = 1.3 };
    const page = page_transform.build(.pixel, 1.7, .{ .x = 96, .y = 96 });
    const mapping = world_page_device.resolve(world, page).?;
    const point: geometry.PointF = .{ .x = 1.4, .y = 1.5 };
    const expected = mapping.mapPoint(source_to_world.mapPoint(point));
    const actual = fromTransform(source_to_world, mapping).mapSourcePoint(point);
    try std.testing.expectEqual(@as(u32, @bitCast(expected.x)), @as(u32, @bitCast(actual.x)));
    try std.testing.expectEqual(@as(u32, @bitCast(expected.y)), @as(u32, @bitCast(actual.y)));
}
