const geometry = @import("emf_plus_geometry.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");

pub const Basis = struct {
    center: geometry.PointF,
    horizontal_radius: geometry.PointF,
    vertical_radius: geometry.PointF,
};

pub fn fromCorners(corners: rect_device_corners.Corners) Basis {
    const horizontal_radius: geometry.PointF = .{
        .x = (corners.upper_right.x - corners.upper_left.x) * 0.5,
        .y = (corners.upper_right.y - corners.upper_left.y) * 0.5,
    };
    const vertical_radius: geometry.PointF = .{
        .x = (corners.lower_left.x - corners.upper_left.x) * 0.5,
        .y = (corners.lower_left.y - corners.upper_left.y) * 0.5,
    };
    return .{
        .center = .{
            .x = corners.upper_left.x + horizontal_radius.x + vertical_radius.x,
            .y = corners.upper_left.y + horizontal_radius.y + vertical_radius.y,
        },
        .horizontal_radius = horizontal_radius,
        .vertical_radius = vertical_radius,
    };
}

const std = @import("std");

fn expectPoint(expected_x: f32, expected_y: f32, actual: geometry.PointF) !void {
    try std.testing.expectEqual(expected_x, actual.x);
    try std.testing.expectEqual(expected_y, actual.y);
}

test "EMF+ ellipse device basis preserves rotated and sheared radius vectors" {
    const basis = fromCorners(.{
        .upper_left = .{ .x = 230, .y = 3000 },
        .upper_right = .{ .x = 290, .y = 3900 },
        .lower_left = .{ .x = 430, .y = 5800 },
        .lower_right = .{ .x = 490, .y = 6700 },
    });
    try expectPoint(360, 4850, basis.center);
    try expectPoint(30, 450, basis.horizontal_radius);
    try expectPoint(100, 1400, basis.vertical_radius);
}

test "EMF+ ellipse device basis preserves reversed axes and exceptional arithmetic" {
    const reversed = fromCorners(.{
        .upper_left = .{ .x = 8, .y = 9 },
        .upper_right = .{ .x = 4, .y = 11 },
        .lower_left = .{ .x = 14, .y = 3 },
        .lower_right = .{ .x = 10, .y = 5 },
    });
    try expectPoint(9, 7, reversed.center);
    try expectPoint(-2, 1, reversed.horizontal_radius);
    try expectPoint(3, -3, reversed.vertical_radius);

    const exceptional = fromCorners(.{
        .upper_left = .{ .x = -0.0, .y = std.math.inf(f32) },
        .upper_right = .{ .x = 0.0, .y = std.math.inf(f32) },
        .lower_left = .{ .x = std.math.inf(f32), .y = -std.math.inf(f32) },
        .lower_right = .{ .x = std.math.inf(f32), .y = std.math.nan(f32) },
    });
    try std.testing.expectEqual(@as(u32, 0), @as(u32, @bitCast(exceptional.horizontal_radius.x)));
    try std.testing.expect(std.math.isNan(exceptional.horizontal_radius.y));
    try std.testing.expect(std.math.isPositiveInf(exceptional.vertical_radius.x));
    try std.testing.expect(std.math.isNegativeInf(exceptional.vertical_radius.y));
    try std.testing.expect(std.math.isNan(exceptional.center.y));
}
