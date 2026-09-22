const std = @import("std");
const arc_device_geometry = @import("emf_plus_arc_device_geometry.zig");
const arc_device_points = @import("emf_plus_arc_device_points.zig");
const ellipse_device_basis = @import("emf_plus_ellipse_device_basis.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const Segment = struct {
    start: geometry.PointF,
    control: geometry.PointF,
    end: geometry.PointF,
    control_weight: f32,
    start_degrees: f32,
    sweep_degrees: f32,
};

pub const Iterator = struct {
    ellipse: ellipse_device_basis.Basis,
    next_degrees: f32,
    remaining_degrees: f32,
    previous_end: ?geometry.PointF = null,

    pub fn next(self: *Iterator) ?Segment {
        if (self.remaining_degrees == 0) return null;

        const sweep_degrees = std.math.clamp(self.remaining_degrees, -90.0, 90.0);
        const start_degrees = @mod(self.next_degrees, 360.0);
        const end_degrees = self.next_degrees + sweep_degrees;
        const middle_degrees = self.next_degrees + sweep_degrees * 0.5;
        const half_radians = sweep_degrees * (@as(f32, std.math.pi) / 360.0);
        const middle_radians = middle_degrees * (@as(f32, std.math.pi) / 180.0);
        const control_weight = @cos(half_radians);
        const start = self.previous_end orelse arc_device_points.pointAtDegrees(self.ellipse, start_degrees);
        const end = arc_device_points.pointAtDegrees(self.ellipse, @mod(end_degrees, 360.0));
        const control = arc_device_points.pointAtComponents(
            self.ellipse,
            @cos(middle_radians) / control_weight,
            @sin(middle_radians) / control_weight,
        );

        self.next_degrees = end_degrees;
        self.remaining_degrees -= sweep_degrees;
        self.previous_end = end;
        return .{
            .start = start,
            .control = control,
            .end = end,
            .control_weight = control_weight,
            .start_degrees = start_degrees,
            .sweep_degrees = sweep_degrees,
        };
    }
};

pub fn segments(arc: arc_device_geometry.Arc) Iterator {
    return .{
        .ellipse = arc.ellipse,
        .next_degrees = arc.start_degrees,
        .remaining_degrees = arc.sweep_degrees,
    };
}

fn expectPoint(expected_x: f32, expected_y: f32, actual: geometry.PointF) !void {
    try std.testing.expectApproxEqAbs(expected_x, actual.x, 0.0001);
    try std.testing.expectApproxEqAbs(expected_y, actual.y, 0.0001);
}

const affine_arc: arc_device_geometry.Arc = .{
    .ellipse = .{
        .center = .{ .x = 10, .y = 20 },
        .horizontal_radius = .{ .x = 4, .y = 1 },
        .vertical_radius = .{ .x = -2, .y = 6 },
    },
    .start_degrees = 0,
    .sweep_degrees = 90,
};

test "EMF+ arc device segment is an exact affine rational quadratic" {
    var iterator = segments(affine_arc);
    const segment = iterator.next().?;
    try expectPoint(14, 21, segment.start);
    try expectPoint(12, 27, segment.control);
    try expectPoint(8, 26, segment.end);
    try std.testing.expectApproxEqAbs(@as(f32, @sqrt(0.5)), segment.control_weight, 0.000001);
    try std.testing.expectEqual(@as(f32, 0), segment.start_degrees);
    try std.testing.expectEqual(@as(f32, 90), segment.sweep_degrees);
    try std.testing.expect(iterator.next() == null);

    const numerator_scale = 0.25;
    const weighted_scale = 0.5 * segment.control_weight;
    const denominator = numerator_scale + weighted_scale + numerator_scale;
    const midpoint: geometry.PointF = .{
        .x = (segment.start.x * numerator_scale + segment.control.x * weighted_scale + segment.end.x * numerator_scale) / denominator,
        .y = (segment.start.y * numerator_scale + segment.control.y * weighted_scale + segment.end.y * numerator_scale) / denominator,
    };
    try expectPoint(
        arc_device_points.pointAtDegrees(affine_arc.ellipse, 45).x,
        arc_device_points.pointAtDegrees(affine_arc.ellipse, 45).y,
        midpoint,
    );
}

test "EMF+ arc device segments preserve signed sweep and exact connectivity" {
    var arc = affine_arc;
    arc.start_degrees = 270;
    arc.sweep_degrees = 200;
    var clockwise = segments(arc);
    const first = clockwise.next().?;
    const second = clockwise.next().?;
    const third = clockwise.next().?;
    try std.testing.expectEqual(@as(f32, 90), first.sweep_degrees);
    try std.testing.expectEqual(@as(f32, 90), second.sweep_degrees);
    try std.testing.expectEqual(@as(f32, 20), third.sweep_degrees);
    try std.testing.expectEqual(first.end, second.start);
    try std.testing.expectEqual(second.end, third.start);
    try std.testing.expect(clockwise.next() == null);

    arc.sweep_degrees = -200;
    var counter_clockwise = segments(arc);
    try std.testing.expectEqual(@as(f32, -90), counter_clockwise.next().?.sweep_degrees);
    try std.testing.expectEqual(@as(f32, -90), counter_clockwise.next().?.sweep_degrees);
    try std.testing.expectEqual(@as(f32, -20), counter_clockwise.next().?.sweep_degrees);
    try std.testing.expect(counter_clockwise.next() == null);
}

test "EMF+ arc device segments close full turns and keep zero sweep empty" {
    var arc = affine_arc;
    arc.start_degrees = 90;
    arc.sweep_degrees = 360;
    var full = segments(arc);
    const first = full.next().?;
    _ = full.next().?;
    _ = full.next().?;
    const fourth = full.next().?;
    try std.testing.expectEqual(first.start, fourth.end);
    try std.testing.expect(full.next() == null);

    arc.sweep_degrees = -0.0;
    var empty = segments(arc);
    try std.testing.expect(empty.next() == null);
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(empty.remaining_degrees)));
}
