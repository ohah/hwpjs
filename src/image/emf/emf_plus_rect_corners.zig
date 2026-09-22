const geometry = @import("emf_plus_geometry.zig");
const rect_data = @import("emf_plus_rect_data.zig");

pub const Corners = struct {
    upper_left: geometry.PointF,
    upper_right: geometry.PointF,
    lower_left: geometry.PointF,
    lower_right: geometry.PointF,
};

pub fn fromRectData(value: rect_data.RectData) Corners {
    const rectangle = rect_data.toRectF(value);
    const right = rectangle.x + rectangle.width;
    const bottom = rectangle.y + rectangle.height;
    return .{
        .upper_left = .{ .x = rectangle.x, .y = rectangle.y },
        .upper_right = .{ .x = right, .y = rectangle.y },
        .lower_left = .{ .x = rectangle.x, .y = bottom },
        .lower_right = .{ .x = right, .y = bottom },
    };
}

const std = @import("std");

test "EMF+ rectangle corners preserve roles and negative dimensions" {
    const corners = fromRectData(.{ .compressed = .{ .x = -2, .y = 3, .width = -4, .height = 5 } });
    try std.testing.expectEqual(geometry.PointF{ .x = -2, .y = 3 }, corners.upper_left);
    try std.testing.expectEqual(geometry.PointF{ .x = -6, .y = 3 }, corners.upper_right);
    try std.testing.expectEqual(geometry.PointF{ .x = -2, .y = 8 }, corners.lower_left);
    try std.testing.expectEqual(geometry.PointF{ .x = -6, .y = 8 }, corners.lower_right);
}

test "EMF+ rectangle corners preserve sequential exceptional arithmetic" {
    const corners = fromRectData(.{ .float = .{
        .x = -0.0,
        .y = std.math.inf(f32),
        .width = 0.0,
        .height = -std.math.inf(f32),
    } });
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(corners.upper_left.x)));
    try std.testing.expectEqual(@as(u32, 0), @as(u32, @bitCast(corners.upper_right.x)));
    try std.testing.expect(std.math.isPositiveInf(corners.upper_left.y));
    try std.testing.expect(std.math.isNan(corners.lower_left.y));
}
