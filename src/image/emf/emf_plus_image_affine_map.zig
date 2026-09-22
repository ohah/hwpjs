const geometry = @import("emf_plus_geometry.zig");
const image_parallelogram = @import("emf_plus_image_parallelogram.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub const DestinationBasis = struct {
    upper_left: geometry.PointF,
    upper_right: geometry.PointF,
    lower_left: geometry.PointF,
};

pub fn build(source: geometry.RectF, destination: image_parallelogram.Parallelogram) transform_matrix.TransformMatrix {
    return buildFromBasis(source, .{
        .upper_left = resolved.toPointF(destination.upper_left),
        .upper_right = resolved.toPointF(destination.upper_right),
        .lower_left = resolved.toPointF(destination.lower_left),
    });
}

pub fn buildFromBasis(source: geometry.RectF, destination: DestinationBasis) transform_matrix.TransformMatrix {
    const m11 = (destination.upper_right.x - destination.upper_left.x) / source.width;
    const m12 = (destination.upper_right.y - destination.upper_left.y) / source.width;
    const m21 = (destination.lower_left.x - destination.upper_left.x) / source.height;
    const m22 = (destination.lower_left.y - destination.upper_left.y) / source.height;
    return .{
        .m11 = m11,
        .m12 = m12,
        .m21 = m21,
        .m22 = m22,
        .dx = destination.upper_left.x - source.x * m11 - source.y * m21,
        .dy = destination.upper_left.y - source.x * m12 - source.y * m22,
    };
}

const std = @import("std");

fn integerPoint(x: i64, y: i64) resolved.Value {
    return .{ .integer = .{ .x = x, .y = y } };
}

fn makeDestination(upper_left: resolved.Value, upper_right: resolved.Value, lower_left: resolved.Value) image_parallelogram.Parallelogram {
    const lower_right: resolved.Value = switch (upper_left) {
        .integer => |origin| .{ .integer = .{
            .x = upper_right.integer.x + lower_left.integer.x - origin.x,
            .y = upper_right.integer.y + lower_left.integer.y - origin.y,
        } },
        .floating => |origin| .{ .floating = .{
            .x = upper_right.floating.x + lower_left.floating.x - origin.x,
            .y = upper_right.floating.y + lower_left.floating.y - origin.y,
        } },
    };
    return .{ .upper_left = upper_left, .upper_right = upper_right, .lower_left = lower_left, .lower_right = lower_right };
}

fn expectPoint(expected: geometry.PointF, actual: geometry.PointF) !void {
    try std.testing.expectApproxEqAbs(expected.x, actual.x, 0.0001);
    try std.testing.expectApproxEqAbs(expected.y, actual.y, 0.0001);
}

test "EMF+ image affine map sends every source corner to the destination parallelogram" {
    const target = makeDestination(integerPoint(100, 200), integerPoint(108, 204), integerPoint(97, 215));
    const matrix = build(.{ .x = 10, .y = 20, .width = 4, .height = 5 }, target);
    try std.testing.expectApproxEqAbs(@as(f32, 2), matrix.m11, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 1), matrix.m12, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, -0.6), matrix.m21, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 3), matrix.m22, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 92), matrix.dx, 0.0001);
    try std.testing.expectApproxEqAbs(@as(f32, 130), matrix.dy, 0.0001);
    try expectPoint(.{ .x = 100, .y = 200 }, matrix.mapPoint(.{ .x = 10, .y = 20 }));
    try expectPoint(.{ .x = 108, .y = 204 }, matrix.mapPoint(.{ .x = 14, .y = 20 }));
    try expectPoint(.{ .x = 97, .y = 215 }, matrix.mapPoint(.{ .x = 10, .y = 25 }));
    try expectPoint(.{ .x = 105, .y = 219 }, matrix.mapPoint(.{ .x = 14, .y = 25 }));
}

test "EMF+ image affine map accepts floating shear and negative source dimensions" {
    const target = makeDestination(
        .{ .floating = .{ .x = -2.5, .y = 7.25 } },
        .{ .floating = .{ .x = 5.5, .y = 3.25 } },
        .{ .floating = .{ .x = 1.5, .y = 19.25 } },
    );
    const source: geometry.RectF = .{ .x = 8, .y = 9, .width = -4, .height = -3 };
    const matrix = build(source, target);
    try expectPoint(target.upper_left.floating, matrix.mapPoint(.{ .x = source.x, .y = source.y }));
    try expectPoint(target.upper_right.floating, matrix.mapPoint(.{ .x = source.x + source.width, .y = source.y }));
    try expectPoint(target.lower_left.floating, matrix.mapPoint(.{ .x = source.x, .y = source.y + source.height }));
}

test "EMF+ image affine map preserves IEEE exceptional arithmetic" {
    const target = makeDestination(integerPoint(100, 200), integerPoint(108, 204), integerPoint(97, 215));
    const matrix = build(.{ .x = 10, .y = 20, .width = 0, .height = -0.0 }, target);
    try std.testing.expect(std.math.isPositiveInf(matrix.m11));
    try std.testing.expect(std.math.isPositiveInf(matrix.m12));
    try std.testing.expect(std.math.isPositiveInf(matrix.m21));
    try std.testing.expect(std.math.isNegativeInf(matrix.m22));
    try std.testing.expect(std.math.isNegativeInf(matrix.dx));
    try std.testing.expect(std.math.isNan(matrix.dy));
}
