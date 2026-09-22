const std = @import("std");
const arc_device_geometry = @import("emf_plus_arc_device_geometry.zig");
const ellipse_device_basis = @import("emf_plus_ellipse_device_basis.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const Endpoints = struct {
    start: geometry.PointF,
    end: geometry.PointF,
};

pub const Segment = struct {
    start: geometry.PointF,
    end: geometry.PointF,
};

pub const PieRadialEdges = struct {
    center_to_start: Segment,
    end_to_center: Segment,
};

pub fn pointAtComponents(ellipse: ellipse_device_basis.Basis, horizontal: f32, vertical: f32) geometry.PointF {
    return .{
        .x = ellipse.center.x + ellipse.horizontal_radius.x * horizontal + ellipse.vertical_radius.x * vertical,
        .y = ellipse.center.y + ellipse.horizontal_radius.y * horizontal + ellipse.vertical_radius.y * vertical,
    };
}

pub fn pointAtDegrees(ellipse: ellipse_device_basis.Basis, degrees: f32) geometry.PointF {
    const radians = degrees * (@as(f32, std.math.pi) / 180.0);
    const cosine = @cos(radians);
    const sine = @sin(radians);
    return pointAtComponents(ellipse, cosine, sine);
}

pub fn endpoints(arc: arc_device_geometry.Arc) Endpoints {
    const end_degrees = @mod(arc.start_degrees + arc.sweep_degrees, 360.0);
    return .{
        .start = pointAtDegrees(arc.ellipse, arc.start_degrees),
        .end = pointAtDegrees(arc.ellipse, end_degrees),
    };
}

pub fn pieRadialEdges(arc: arc_device_geometry.Arc) PieRadialEdges {
    const points = endpoints(arc);
    return .{
        .center_to_start = .{ .start = arc.ellipse.center, .end = points.start },
        .end_to_center = .{ .start = points.end, .end = arc.ellipse.center },
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

test "EMF+ arc points evaluate clockwise angles on an affine ellipse" {
    try expectPoint(14, 21, pointAtDegrees(affine_arc.ellipse, 0));
    try expectPoint(8, 26, pointAtDegrees(affine_arc.ellipse, 90));
    try expectPoint(6, 19, pointAtDegrees(affine_arc.ellipse, 180));
    try expectPoint(12, 14, pointAtDegrees(affine_arc.ellipse, 270));

    const points = endpoints(affine_arc);
    try expectPoint(14, 21, points.start);
    try expectPoint(8, 26, points.end);
}

test "EMF+ arc endpoints preserve sweep direction and wrap full turns" {
    var arc = affine_arc;
    arc.start_degrees = 270;
    arc.sweep_degrees = 90;
    try expectPoint(12, 14, endpoints(arc).start);
    try expectPoint(14, 21, endpoints(arc).end);

    arc.sweep_degrees = -90;
    try expectPoint(6, 19, endpoints(arc).end);

    arc.start_degrees = 90;
    arc.sweep_degrees = 360;
    const clockwise = endpoints(arc);
    try expectPoint(clockwise.start.x, clockwise.start.y, clockwise.end);

    arc.sweep_degrees = -360;
    const counter_clockwise = endpoints(arc);
    try expectPoint(counter_clockwise.start.x, counter_clockwise.start.y, counter_clockwise.end);
}

test "EMF+ pie radial edges retain boundary direction and zero sweep" {
    const edges = pieRadialEdges(affine_arc);
    try expectPoint(10, 20, edges.center_to_start.start);
    try expectPoint(14, 21, edges.center_to_start.end);
    try expectPoint(8, 26, edges.end_to_center.start);
    try expectPoint(10, 20, edges.end_to_center.end);

    var zero = affine_arc;
    zero.start_degrees = 180;
    zero.sweep_degrees = -0.0;
    const zero_edges = pieRadialEdges(zero);
    try expectPoint(zero_edges.center_to_start.end.x, zero_edges.center_to_start.end.y, zero_edges.end_to_center.start);
}
