const std = @import("std");
const geometry = @import("emf_plus_geometry.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const unit_type = @import("emf_plus_unit_type.zig");

pub const Resolution = struct {
    x: u32,
    y: u32,
};

fn unitsToPixels(unit: unit_type.UnitType, dpi: u32) ?f32 {
    const resolution: f32 = @floatFromInt(dpi);
    return switch (unit) {
        .world, .display => null,
        .pixel => 1,
        .point => resolution / 72.0,
        .inch => resolution,
        .document => resolution / 300.0,
        .millimeter => resolution / 25.4,
    };
}

pub fn build(dest: geometry.RectF, source: geometry.RectF, unit: unit_type.UnitType, resolution: Resolution) ?transform_matrix.TransformMatrix {
    const unit_x = unitsToPixels(unit, resolution.x) orelse return null;
    const unit_y = unitsToPixels(unit, resolution.y) orelse return null;
    const source_x = unit_x * source.x;
    const source_y = unit_y * source.y;
    const source_width = unit_x * source.width;
    const source_height = unit_y * source.height;
    return .{
        .m11 = dest.width / source_width,
        .m12 = 0,
        .m21 = 0,
        .m22 = dest.height / source_height,
        .dx = dest.x - source_x,
        .dy = dest.y - source_y,
    };
}

test "EMF+ BeginContainer pixel transform matches the documented GDI+ translation and scale example" {
    const value = build(
        .{ .x = 100, .y = 100, .width = 200, .height = 200 },
        .{ .x = 0, .y = 0, .width = 200, .height = 100 },
        .pixel,
        .{ .x = 96, .y = 120 },
    ).?;
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 1,
        .m12 = 0,
        .m21 = 0,
        .m22 = 2,
        .dx = 100,
        .dy = 100,
    }, value);
}

test "EMF+ BeginContainer converts physical source units independently with logical DPI" {
    const point = build(
        .{ .x = 20, .y = 30, .width = 144, .height = 144 },
        .{ .x = 2, .y = 3, .width = 72, .height = 72 },
        .point,
        .{ .x = 144, .y = 72 },
    ).?;
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 1,
        .m12 = 0,
        .m21 = 0,
        .m22 = 2,
        .dx = 16,
        .dy = 27,
    }, point);
    const inch = build(
        .{ .x = 0, .y = 0, .width = 96, .height = 120 },
        .{ .x = 0, .y = 0, .width = 1, .height = 1 },
        .inch,
        .{ .x = 96, .y = 120 },
    ).?;
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.identity, inch);
    const document = build(
        .{ .x = 0, .y = 0, .width = 96, .height = 120 },
        .{ .x = 0, .y = 0, .width = 300, .height = 300 },
        .document,
        .{ .x = 96, .y = 120 },
    ).?;
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.identity, document);
    const millimeter = build(
        .{ .x = 0, .y = 0, .width = 96, .height = 120 },
        .{ .x = 0, .y = 0, .width = 25.4, .height = 25.4 },
        .millimeter,
        .{ .x = 96, .y = 120 },
    ).?;
    try std.testing.expectApproxEqAbs(@as(f32, 1), millimeter.m11, 0.000001);
    try std.testing.expectApproxEqAbs(@as(f32, 1), millimeter.m22, 0.000001);
}

test "EMF+ BeginContainer leaves discouraged World and Display transforms unknown" {
    const rect: geometry.RectF = .{ .x = 0, .y = 0, .width = 1, .height = 1 };
    try std.testing.expect(build(rect, rect, .world, .{ .x = 96, .y = 96 }) == null);
    try std.testing.expect(build(rect, rect, .display, .{ .x = 96, .y = 96 }) == null);
}

test "EMF+ BeginContainer arithmetic preserves IEEE exceptional results" {
    const value = build(
        .{ .x = 1, .y = 2, .width = 3, .height = 4 },
        .{ .x = 5, .y = 6, .width = 0, .height = -0.0 },
        .pixel,
        .{ .x = 0, .y = 0 },
    ).?;
    try std.testing.expect(std.math.isPositiveInf(value.m11));
    try std.testing.expect(std.math.isNegativeInf(value.m22));
    try std.testing.expectEqual(@as(f32, -4), value.dx);
    try std.testing.expectEqual(@as(f32, -4), value.dy);
}
