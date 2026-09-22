const arc_device_geometry = @import("emf_plus_arc_device_geometry.zig");
const arc_device_points = @import("emf_plus_arc_device_points.zig");
const arc_device_segments = @import("emf_plus_arc_device_segments.zig");

pub const Segment = union(enum) {
    center_to_start: arc_device_points.Segment,
    arc: arc_device_segments.Segment,
    end_to_center: arc_device_points.Segment,
};

const Phase = enum {
    center_to_start,
    arc,
    end_to_center,
    done,
};

pub const Iterator = struct {
    radial_edges: arc_device_points.PieRadialEdges,
    arc_segments: arc_device_segments.Iterator,
    phase: Phase = .center_to_start,

    pub fn next(self: *Iterator) ?Segment {
        while (true) switch (self.phase) {
            .center_to_start => {
                self.phase = .arc;
                return .{ .center_to_start = self.radial_edges.center_to_start };
            },
            .arc => {
                if (self.arc_segments.next()) |segment| return .{ .arc = segment };
                self.phase = .end_to_center;
            },
            .end_to_center => {
                self.phase = .done;
                return .{ .end_to_center = self.radial_edges.end_to_center };
            },
            .done => return null,
        };
    }
};

pub fn boundary(arc: arc_device_geometry.Arc) Iterator {
    return .{
        .radial_edges = arc_device_points.pieRadialEdges(arc),
        .arc_segments = arc_device_segments.segments(arc),
    };
}

const std = @import("std");

fn expectCenterToStart(segment: Segment) !arc_device_points.Segment {
    try std.testing.expectEqual(std.meta.Tag(Segment).center_to_start, std.meta.activeTag(segment));
    return segment.center_to_start;
}

fn expectArc(segment: Segment) !arc_device_segments.Segment {
    try std.testing.expectEqual(std.meta.Tag(Segment).arc, std.meta.activeTag(segment));
    return segment.arc;
}

fn expectEndToCenter(segment: Segment) !arc_device_points.Segment {
    try std.testing.expectEqual(std.meta.Tag(Segment).end_to_center, std.meta.activeTag(segment));
    return segment.end_to_center;
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

test "EMF+ Pie device boundary orders radial lines around exact arc segments" {
    var iterator = boundary(affine_arc);
    const opening = try expectCenterToStart(iterator.next().?);
    const arc = try expectArc(iterator.next().?);
    const closing = try expectEndToCenter(iterator.next().?);
    try std.testing.expectEqual(affine_arc.ellipse.center, opening.start);
    try std.testing.expectEqual(opening.end, arc.start);
    try std.testing.expectEqual(arc.end, closing.start);
    try std.testing.expectEqual(affine_arc.ellipse.center, closing.end);
    try std.testing.expect(iterator.next() == null);
}

test "EMF+ Pie device boundary preserves negative multi-segment sweep" {
    var arc = affine_arc;
    arc.start_degrees = 270;
    arc.sweep_degrees = -200;
    var iterator = boundary(arc);
    const opening = try expectCenterToStart(iterator.next().?);
    const first = try expectArc(iterator.next().?);
    const second = try expectArc(iterator.next().?);
    const third = try expectArc(iterator.next().?);
    const closing = try expectEndToCenter(iterator.next().?);
    try std.testing.expectEqual(@as(f32, -90), first.sweep_degrees);
    try std.testing.expectEqual(@as(f32, -90), second.sweep_degrees);
    try std.testing.expectEqual(@as(f32, -20), third.sweep_degrees);
    try std.testing.expectEqual(opening.end, first.start);
    try std.testing.expectEqual(first.end, second.start);
    try std.testing.expectEqual(second.end, third.start);
    try std.testing.expectEqual(third.end, closing.start);
    try std.testing.expect(iterator.next() == null);
}

test "EMF+ Pie device boundary retains radial roles for zero and full sweep" {
    var arc = affine_arc;
    arc.sweep_degrees = -0.0;
    var zero = boundary(arc);
    const zero_opening = try expectCenterToStart(zero.next().?);
    const zero_closing = try expectEndToCenter(zero.next().?);
    try std.testing.expectEqual(zero_opening.end, zero_closing.start);
    try std.testing.expect(zero.next() == null);

    arc.start_degrees = 90;
    arc.sweep_degrees = 360;
    var full = boundary(arc);
    const full_opening = try expectCenterToStart(full.next().?);
    _ = try expectArc(full.next().?);
    _ = try expectArc(full.next().?);
    _ = try expectArc(full.next().?);
    const last_arc = try expectArc(full.next().?);
    const full_closing = try expectEndToCenter(full.next().?);
    try std.testing.expectEqual(full_opening.end, last_arc.end);
    try std.testing.expectEqual(last_arc.end, full_closing.start);
    try std.testing.expect(full.next() == null);
}
