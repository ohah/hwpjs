const boundary = @import("emf_plus_path_device_boundary_polyline.zig");
const geometry = @import("emf_plus_geometry.zig");
const path_polyline = @import("emf_plus_path_device_polyline.zig");
const path_type = @import("emf_plus_path_type.zig");

pub const EdgeRole = enum {
    flattened,
    source_endpoint,
    explicit_closure,
    implicit_closure,
};

pub const Move = struct {
    figure_index: usize,
    source_figure_index: usize,
    point: geometry.PointF,
    point_type: path_type.Value,
    closure: boundary.Closure,
};

pub const Edge = struct {
    figure_index: usize,
    source_figure_index: usize,
    start: geometry.PointF,
    end: geometry.PointF,
    end_type: ?path_type.Value,
    role: EdgeRole,
};

pub const Event = union(enum) {
    move_to: Move,
    edge: Edge,
};

pub const Iterator = struct {
    source: boundary.Geometry,
    figure_index: usize = 0,
    point_index: usize = 0,
    next_point_start: usize = 0,

    pub fn next(self: *Iterator) !?Event {
        var pending = self.*;
        if (pending.figure_index == pending.source.figures.len) {
            if (pending.next_point_start != pending.source.points.len)
                return error.InvalidEmfPlusPathBoundaryEdgePointRange;
            return null;
        }

        const figure = pending.source.figures[pending.figure_index];
        if (figure.source_figure_index != pending.figure_index)
            return error.InvalidEmfPlusPathBoundaryEdgeFigureIndex;
        if (figure.points.start != pending.next_point_start)
            return error.InvalidEmfPlusPathBoundaryEdgePointRange;
        const points = try pending.source.pointsFor(pending.figure_index);
        try validateFigure(points, figure.closure);

        if (pending.point_index == 0) {
            const result: Event = .{ .move_to = .{
                .figure_index = pending.figure_index,
                .source_figure_index = figure.source_figure_index,
                .point = points[0].value,
                .point_type = points[0].source_type.?,
                .closure = figure.closure,
            } };
            pending.point_index = 1;
            if (points.len == 1) {
                pending.next_point_start += 1;
                pending.figure_index += 1;
                pending.point_index = 0;
            }
            self.* = pending;
            return result;
        }

        const end_index = pending.point_index;
        const is_last = end_index == points.len - 1;
        const end = points[end_index];
        const role: EdgeRole = if (is_last) switch (figure.closure) {
            .explicit => .explicit_closure,
            .implicit => .implicit_closure,
            .none => if (end.source_type == null) .flattened else .source_endpoint,
        } else if (end.source_type == null) .flattened else .source_endpoint;
        const result: Event = .{ .edge = .{
            .figure_index = pending.figure_index,
            .source_figure_index = figure.source_figure_index,
            .start = points[end_index - 1].value,
            .end = end.value,
            .end_type = end.source_type,
            .role = role,
        } };
        pending.point_index += 1;
        if (pending.point_index == points.len) {
            pending.next_point_start += points.len;
            pending.figure_index += 1;
            pending.point_index = 0;
        }
        self.* = pending;
        return result;
    }
};

pub fn events(source: boundary.Geometry) Iterator {
    return .{ .source = source };
}

fn validateFigure(points: []const path_polyline.Point, closure: boundary.Closure) !void {
    if (points.len == 0 or points[0].source_type == null)
        return error.InvalidEmfPlusPathBoundaryEdgeFigure;
    if (points[0].source_type.?.point_type.kind != .start)
        return error.InvalidEmfPlusPathBoundaryEdgeMoveType;
    switch (closure) {
        .none => if (points.len > 1 and points[points.len - 1].source_type == null)
            return error.InvalidEmfPlusPathBoundaryEdgeClosure,
        .explicit, .implicit => {
            if (points.len < 3 or points[points.len - 1].source_type != null)
                return error.InvalidEmfPlusPathBoundaryEdgeClosure;
            if (!path_polyline.pointBitsEqual(points[0].value, points[points.len - 1].value))
                return error.InvalidEmfPlusPathBoundaryEdgeClosure;
        },
    }
}

const std = @import("std");

fn typeValue(raw: u8) path_type.Value {
    return .{ .point_type = path_type.parse(raw) catch unreachable, .rle_bezier = null };
}

fn fixture() struct { figures: [4]boundary.Figure, points: [10]path_polyline.Point } {
    return .{
        .figures = .{
            .{ .source_figure_index = 0, .points = .{ .start = 0, .count = 4 }, .closure = .explicit },
            .{ .source_figure_index = 1, .points = .{ .start = 4, .count = 2 }, .closure = .none },
            .{ .source_figure_index = 2, .points = .{ .start = 6, .count = 1 }, .closure = .none },
            .{ .source_figure_index = 3, .points = .{ .start = 7, .count = 3 }, .closure = .implicit },
        },
        .points = .{
            .{ .value = .{ .x = 0, .y = 0 }, .source_type = typeValue(0x20) },
            .{ .value = .{ .x = 1, .y = 2 }, .source_type = null },
            .{ .value = .{ .x = 3, .y = 4 }, .source_type = typeValue(0xb3) },
            .{ .value = .{ .x = 0, .y = 0 }, .source_type = null },
            .{ .value = .{ .x = 10, .y = 11 }, .source_type = typeValue(0x00) },
            .{ .value = .{ .x = 12, .y = 13 }, .source_type = typeValue(0x11) },
            .{ .value = .{ .x = 20, .y = 21 }, .source_type = typeValue(0xa0) },
            .{ .value = .{ .x = 30, .y = 31 }, .source_type = typeValue(0x00) },
            .{ .value = .{ .x = 32, .y = 33 }, .source_type = typeValue(0x21) },
            .{ .value = .{ .x = 30, .y = 31 }, .source_type = null },
        },
    };
}

fn expectEvent(iterator: *Iterator) !Event {
    const value = try iterator.next();
    try std.testing.expect(value != null);
    return value.?;
}

test "EMF+ Path boundary edges preserve moves endpoint metadata and closure roles" {
    const input = fixture();
    var iterator = events(.{ .figures = @constCast(&input.figures), .points = @constCast(&input.points) });

    try std.testing.expectEqualDeep(Event{ .move_to = .{
        .figure_index = 0,
        .source_figure_index = 0,
        .point = .{ .x = 0, .y = 0 },
        .point_type = typeValue(0x20),
        .closure = .explicit,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .edge = .{
        .figure_index = 0,
        .source_figure_index = 0,
        .start = .{ .x = 0, .y = 0 },
        .end = .{ .x = 1, .y = 2 },
        .end_type = null,
        .role = .flattened,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .edge = .{
        .figure_index = 0,
        .source_figure_index = 0,
        .start = .{ .x = 1, .y = 2 },
        .end = .{ .x = 3, .y = 4 },
        .end_type = typeValue(0xb3),
        .role = .source_endpoint,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .edge = .{
        .figure_index = 0,
        .source_figure_index = 0,
        .start = .{ .x = 3, .y = 4 },
        .end = .{ .x = 0, .y = 0 },
        .end_type = null,
        .role = .explicit_closure,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .move_to = .{
        .figure_index = 1,
        .source_figure_index = 1,
        .point = .{ .x = 10, .y = 11 },
        .point_type = typeValue(0x00),
        .closure = .none,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .edge = .{
        .figure_index = 1,
        .source_figure_index = 1,
        .start = .{ .x = 10, .y = 11 },
        .end = .{ .x = 12, .y = 13 },
        .end_type = typeValue(0x11),
        .role = .source_endpoint,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .move_to = .{
        .figure_index = 2,
        .source_figure_index = 2,
        .point = .{ .x = 20, .y = 21 },
        .point_type = typeValue(0xa0),
        .closure = .none,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .move_to = .{
        .figure_index = 3,
        .source_figure_index = 3,
        .point = .{ .x = 30, .y = 31 },
        .point_type = typeValue(0x00),
        .closure = .implicit,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .edge = .{
        .figure_index = 3,
        .source_figure_index = 3,
        .start = .{ .x = 30, .y = 31 },
        .end = .{ .x = 32, .y = 33 },
        .end_type = typeValue(0x21),
        .role = .source_endpoint,
    } }, try expectEvent(&iterator));
    try std.testing.expectEqualDeep(Event{ .edge = .{
        .figure_index = 3,
        .source_figure_index = 3,
        .start = .{ .x = 32, .y = 33 },
        .end = .{ .x = 30, .y = 31 },
        .end_type = null,
        .role = .implicit_closure,
    } }, try expectEvent(&iterator));
    try std.testing.expect((try iterator.next()) == null);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path boundary edges reject malformed aggregate atomically" {
    const input = fixture();
    const source: boundary.Geometry = .{ .figures = @constCast(&input.figures), .points = @constCast(&input.points) };

    var bad_figures = input.figures;
    bad_figures[1].points.start = 3;
    var iterator = events(.{ .figures = &bad_figures, .points = source.points });
    _ = try iterator.next();
    _ = try iterator.next();
    _ = try iterator.next();
    _ = try iterator.next();
    const before = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgePointRange, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);

    bad_figures = input.figures;
    bad_figures[0].source_figure_index = 1;
    var bad_iterator = events(.{ .figures = &bad_figures, .points = source.points });
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeFigureIndex, bad_iterator.next());
    var bad_points = input.points;
    bad_points[0].source_type = null;
    bad_iterator = events(.{ .figures = source.figures, .points = &bad_points });
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeFigure, bad_iterator.next());
    bad_points = input.points;
    bad_points[0].source_type = typeValue(0x01);
    bad_iterator = events(.{ .figures = source.figures, .points = &bad_points });
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeMoveType, bad_iterator.next());
    bad_points = input.points;
    bad_points[3].source_type = typeValue(0x01);
    bad_iterator = events(.{ .figures = source.figures, .points = &bad_points });
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeClosure, bad_iterator.next());
    bad_points = input.points;
    bad_points[3].value.x = 1;
    bad_iterator = events(.{ .figures = source.figures, .points = &bad_points });
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeClosure, bad_iterator.next());
    bad_points = input.points;
    bad_points[5].source_type = null;
    var open_iterator = events(.{ .figures = source.figures, .points = &bad_points });
    for (0..4) |_| _ = try open_iterator.next();
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeClosure, open_iterator.next());

    var trailing_points: [11]path_polyline.Point = undefined;
    @memcpy(trailing_points[0..10], &input.points);
    trailing_points[10] = input.points[9];
    var trailing = events(.{ .figures = source.figures, .points = &trailing_points });
    for (0..10) |_| _ = try expectEvent(&trailing);
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgePointRange, trailing.next());
}

test "EMF+ Path boundary edges reject empty closed signed-zero and out-of-range figures" {
    var empty = events(.{ .figures = &.{}, .points = &.{} });
    try std.testing.expect((try empty.next()) == null);
    try std.testing.expect((try empty.next()) == null);

    var empty_figure_data = [_]boundary.Figure{
        .{ .source_figure_index = 0, .points = .{ .start = 0, .count = 0 }, .closure = .none },
    };
    var empty_figure = events(.{ .figures = &empty_figure_data, .points = &.{} });
    const before_empty_figure = empty_figure;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeFigure, empty_figure.next());
    try std.testing.expectEqualDeep(before_empty_figure, empty_figure);

    var only_point = [_]path_polyline.Point{
        .{ .value = .{ .x = 0, .y = 0 }, .source_type = typeValue(0x00) },
    };
    var one_figure = [_]boundary.Figure{
        .{ .source_figure_index = 0, .points = .{ .start = 0, .count = 1 }, .closure = .explicit },
    };
    var iterator = events(.{ .figures = &one_figure, .points = &only_point });
    const before_one = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeClosure, iterator.next());
    try std.testing.expectEqualDeep(before_one, iterator);

    var no_drawable_points = [_]path_polyline.Point{
        .{ .value = .{ .x = 0, .y = 1 }, .source_type = typeValue(0x00) },
        .{ .value = .{ .x = 0, .y = 1 }, .source_type = null },
    };
    one_figure[0].points.count = 2;
    iterator = events(.{ .figures = &one_figure, .points = &no_drawable_points });
    const before_no_drawable = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeClosure, iterator.next());
    try std.testing.expectEqualDeep(before_no_drawable, iterator);

    var signed_zero_points = [_]path_polyline.Point{
        .{ .value = .{ .x = 0.0, .y = 1.0 }, .source_type = typeValue(0x00) },
        .{ .value = .{ .x = -0.0, .y = 1.0 }, .source_type = null },
    };
    one_figure[0].points.count = 2;
    iterator = events(.{ .figures = &one_figure, .points = &signed_zero_points });
    const before_zero = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgeClosure, iterator.next());
    try std.testing.expectEqualDeep(before_zero, iterator);

    one_figure[0].closure = .none;
    one_figure[0].points = .{ .start = 0, .count = 3 };
    iterator = events(.{ .figures = &one_figure, .points = &only_point });
    const before_range = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryPointRange, iterator.next());
    try std.testing.expectEqualDeep(before_range, iterator);

    var trailing_without_figures = events(.{ .figures = &.{}, .points = &only_point });
    const before_trailing = trailing_without_figures;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryEdgePointRange, trailing_without_figures.next());
    try std.testing.expectEqualDeep(before_trailing, trailing_without_figures);
}
