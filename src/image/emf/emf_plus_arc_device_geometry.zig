const arc_angles = @import("emf_plus_arc_angles.zig");
const ellipse_device_basis = @import("emf_plus_ellipse_device_basis.zig");
const rect_device_corners = @import("emf_plus_rect_device_corners.zig");

pub const Arc = struct {
    ellipse: ellipse_device_basis.Basis,
    start_degrees: f32,
    sweep_degrees: f32,
};

pub fn build(corners: rect_device_corners.Corners, start_degrees: f32, sweep_degrees: f32) ?Arc {
    const angles = arc_angles.resolve(start_degrees, sweep_degrees) orelse return null;
    return .{
        .ellipse = ellipse_device_basis.fromCorners(corners),
        .start_degrees = angles.start_degrees,
        .sweep_degrees = angles.sweep_degrees,
    };
}

const std = @import("std");

test "EMF+ arc device geometry combines affine ellipse and interpreted angles" {
    const value = build(.{
        .upper_left = .{ .x = 230, .y = 3000 },
        .upper_right = .{ .x = 290, .y = 3900 },
        .lower_left = .{ .x = 430, .y = 5800 },
        .lower_right = .{ .x = 490, .y = 6700 },
    }, 450, -720).?;
    try std.testing.expectEqual(@as(f32, 360), value.ellipse.center.x);
    try std.testing.expectEqual(@as(f32, 4850), value.ellipse.center.y);
    try std.testing.expectEqual(@as(f32, 30), value.ellipse.horizontal_radius.x);
    try std.testing.expectEqual(@as(f32, 1400), value.ellipse.vertical_radius.y);
    try std.testing.expectEqual(@as(f32, 90), value.start_degrees);
    try std.testing.expectEqual(@as(f32, -360), value.sweep_degrees);
}

test "EMF+ arc device geometry rejects only uninterpretable angles" {
    const corners: rect_device_corners.Corners = .{
        .upper_left = .{ .x = 0, .y = 0 },
        .upper_right = .{ .x = 2, .y = 0 },
        .lower_left = .{ .x = 0, .y = 2 },
        .lower_right = .{ .x = 2, .y = 2 },
    };
    try std.testing.expect(build(corners, std.math.nan(f32), 1) == null);
    try std.testing.expect(build(corners, 1, std.math.inf(f32)) == null);
    try std.testing.expect(build(corners, -90, 0) == null);
    const finite = build(corners, 90, 0).?;
    try std.testing.expectEqual(@as(f32, 90), finite.start_degrees);
    try std.testing.expectEqual(@as(f32, 0), finite.sweep_degrees);
}
