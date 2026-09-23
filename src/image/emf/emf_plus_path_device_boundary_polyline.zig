const std = @import("std");
const device_commands = @import("emf_plus_path_device_commands.zig");
const device_geometry = @import("emf_plus_path_device_geometry.zig");
const path_polyline = @import("emf_plus_path_device_polyline.zig");

pub const Policy = enum { stroke, fill };
pub const Closure = enum { none, explicit, implicit };

pub const Options = struct {
    max_points: usize = 1_000_000,
};

pub const CollectOptions = struct {
    polyline: path_polyline.CollectOptions,
    boundary: Options = .{},
};

pub const Figure = struct {
    source_figure_index: usize,
    points: device_geometry.Range,
    closure: Closure,
};

pub const Geometry = struct {
    figures: []Figure,
    points: []path_polyline.Point,

    pub fn deinit(self: *Geometry, allocator: std.mem.Allocator) void {
        allocator.free(self.figures);
        allocator.free(self.points);
        self.* = undefined;
    }

    pub fn pointsFor(self: Geometry, figure_index: usize) ![]const path_polyline.Point {
        if (figure_index >= self.figures.len) return error.EmfPlusPathFigureIndexOutOfBounds;
        const range = self.figures[figure_index].points;
        if (range.start > self.points.len or range.count > self.points.len - range.start)
            return error.InvalidEmfPlusPathBoundaryPointRange;
        return self.points[range.start..][0..range.count];
    }
};

pub fn build(allocator: std.mem.Allocator, source: path_polyline.Geometry, policy: Policy, options: Options) !Geometry {
    var figures: std.ArrayList(Figure) = .empty;
    defer figures.deinit(allocator);
    var points: std.ArrayList(path_polyline.Point) = .empty;
    defer points.deinit(allocator);

    var next_source_point: usize = 0;
    var next_source_command: usize = 0;
    for (source.figures, 0..) |source_figure, source_figure_index| {
        if (source_figure.points.start != next_source_point)
            return error.InvalidEmfPlusPathBoundarySourcePointRange;
        if (source_figure.source_commands.start != next_source_command)
            return error.InvalidEmfPlusPathBoundarySourceCommandRange;
        const source_points = try source.pointsFor(source_figure_index);
        const source_commands = try source.commandsFor(source_figure_index);
        if (source_points.len == 0) return error.InvalidEmfPlusPathBoundarySourceFigure;
        if (!path_polyline.pointBitsEqual(source_points[0].value, source_figure.move_to.value))
            return error.InvalidEmfPlusPathBoundarySourceFigure;
        if (source_figure.closed != expectedClosed(source_figure.move_to, source_commands))
            return error.InvalidEmfPlusPathBoundarySourceClosure;
        const point_start = points.items.len;
        try appendSlice(allocator, &points, source_points, options.max_points);

        const drawable = source_commands.len != 0;
        const closure: Closure = switch (policy) {
            .stroke => if (drawable and source_figure.closed) .explicit else .none,
            .fill => if (!drawable) .none else if (source_figure.closed) .explicit else .implicit,
        };
        if (closure != .none)
            try appendPoint(allocator, &points, .{ .value = source_points[0].value, .source_type = null }, options.max_points);
        try figures.append(allocator, .{
            .source_figure_index = source_figure_index,
            .points = .{ .start = point_start, .count = points.items.len - point_start },
            .closure = closure,
        });
        next_source_point += source_points.len;
        next_source_command += source_commands.len;
    }
    if (next_source_point != source.points.len)
        return error.InvalidEmfPlusPathBoundarySourcePointRange;
    if (next_source_command != source.commands.len)
        return error.InvalidEmfPlusPathBoundarySourceCommandRange;

    const owned_figures = try figures.toOwnedSlice(allocator);
    errdefer allocator.free(owned_figures);
    return .{
        .figures = owned_figures,
        .points = try points.toOwnedSlice(allocator),
    };
}

fn expectedClosed(move: device_commands.TypedPoint, commands: []const device_geometry.Command) bool {
    if (commands.len == 0) return move.closesFigure();
    return commands[commands.len - 1].closesFigure();
}

pub fn collect(allocator: std.mem.Allocator, source: device_commands.Iterator, policy: Policy, options: CollectOptions) !Geometry {
    var polyline = try path_polyline.collect(allocator, source, options.polyline);
    defer polyline.deinit(allocator);
    return build(allocator, polyline, policy, options.boundary);
}

fn appendSlice(allocator: std.mem.Allocator, points: *std.ArrayList(path_polyline.Point), values: []const path_polyline.Point, maximum: usize) !void {
    if (points.items.len > maximum or values.len > maximum - points.items.len)
        return error.EmfPlusPathBoundaryPointLimitExceeded;
    try points.appendSlice(allocator, values);
}

fn appendPoint(allocator: std.mem.Allocator, points: *std.ArrayList(path_polyline.Point), value: path_polyline.Point, maximum: usize) !void {
    if (points.items.len == maximum) return error.EmfPlusPathBoundaryPointLimitExceeded;
    try points.append(allocator, value);
}

const geometry = @import("emf_plus_geometry.zig");
const path_type = @import("emf_plus_path_type.zig");

fn typeValue(raw: u8) path_type.Value {
    return .{ .point_type = path_type.parse(raw) catch unreachable, .rle_bezier = null };
}

fn fixture() struct {
    figures: [4]path_polyline.Figure,
    commands: [3]device_geometry.Command,
    points: [7]path_polyline.Point,
} {
    const move0: device_commands.TypedPoint = .{ .value = .{ .x = 0, .y = 0 }, .point_type = typeValue(0x20) };
    const move1: device_commands.TypedPoint = .{ .value = .{ .x = 10, .y = 10 }, .point_type = typeValue(0x00) };
    const move2: device_commands.TypedPoint = .{ .value = .{ .x = 20, .y = 20 }, .point_type = typeValue(0xa0) };
    const move3: device_commands.TypedPoint = .{ .value = .{ .x = 30, .y = 30 }, .point_type = typeValue(0x00) };
    return .{
        .figures = .{
            .{ .move_to = move0, .source_points = .{ .start = 0, .count = 2 }, .source_commands = .{ .start = 0, .count = 1 }, .points = .{ .start = 0, .count = 2 }, .closed = true },
            .{ .move_to = move1, .source_points = .{ .start = 2, .count = 2 }, .source_commands = .{ .start = 1, .count = 1 }, .points = .{ .start = 2, .count = 2 }, .closed = false },
            .{ .move_to = move2, .source_points = .{ .start = 4, .count = 1 }, .source_commands = .{ .start = 2, .count = 0 }, .points = .{ .start = 4, .count = 1 }, .closed = true },
            .{ .move_to = move3, .source_points = .{ .start = 5, .count = 2 }, .source_commands = .{ .start = 2, .count = 1 }, .points = .{ .start = 5, .count = 2 }, .closed = true },
        },
        .commands = .{
            .{ .bezier_to = .{ .start = move0.value, .control1 = .{ .value = .{ .x = 0, .y = 3 }, .point_type = typeValue(0x03) }, .control2 = .{ .value = .{ .x = 2, .y = 3 }, .point_type = typeValue(0x03) }, .end = .{ .value = .{ .x = 2, .y = 3 }, .point_type = typeValue(0x93) }, .figure_start = move0.value } },
            .{ .line_to = .{ .start = move1.value, .end = .{ .value = .{ .x = 12, .y = 13 }, .point_type = typeValue(0x11) }, .figure_start = move1.value } },
            .{ .line_to = .{ .start = move3.value, .end = .{ .value = move3.value, .point_type = typeValue(0x81) }, .figure_start = move3.value } },
        },
        .points = .{
            .{ .value = move0.value, .source_type = move0.point_type },
            .{ .value = .{ .x = 2, .y = 3 }, .source_type = typeValue(0x93) },
            .{ .value = move1.value, .source_type = move1.point_type },
            .{ .value = .{ .x = 12, .y = 13 }, .source_type = typeValue(0x11) },
            .{ .value = move2.value, .source_type = move2.point_type },
            .{ .value = move3.value, .source_type = move3.point_type },
            .{ .value = move3.value, .source_type = typeValue(0x81) },
        },
    };
}

fn sourceFrom(value: anytype) path_polyline.Geometry {
    return .{
        .figures = @constCast(&value.figures),
        .commands = @constCast(&value.commands),
        .points = @constCast(&value.points),
    };
}

test "EMF+ Path boundary polylines preserve distinct stroke and fill closure policy and metadata" {
    const input = fixture();
    const source = sourceFrom(&input);
    var stroke = try build(std.testing.allocator, source, .stroke, .{});
    defer stroke.deinit(std.testing.allocator);
    var fill = try build(std.testing.allocator, source, .fill, .{});
    defer fill.deinit(std.testing.allocator);

    try std.testing.expectEqual(@as(usize, 4), stroke.figures.len);
    try std.testing.expectEqual(@as(usize, 4), fill.figures.len);
    try std.testing.expectEqual(@as(usize, 0), stroke.figures[0].source_figure_index);
    try std.testing.expectEqual(device_geometry.Range{ .start = 0, .count = 3 }, stroke.figures[0].points);
    try std.testing.expectEqual(@as(usize, 1), stroke.figures[1].source_figure_index);
    try std.testing.expectEqual(device_geometry.Range{ .start = 3, .count = 2 }, stroke.figures[1].points);
    try std.testing.expectEqual(device_geometry.Range{ .start = 3, .count = 3 }, fill.figures[1].points);
    try std.testing.expectEqual(device_geometry.Range{ .start = 5, .count = 1 }, stroke.figures[2].points);
    try std.testing.expectEqual(device_geometry.Range{ .start = 6, .count = 3 }, stroke.figures[3].points);
    try std.testing.expectEqual(Closure.explicit, stroke.figures[0].closure);
    try std.testing.expectEqual(Closure.explicit, fill.figures[0].closure);
    try std.testing.expectEqual(Closure.none, stroke.figures[1].closure);
    try std.testing.expectEqual(Closure.implicit, fill.figures[1].closure);
    try std.testing.expectEqual(Closure.none, stroke.figures[2].closure);
    try std.testing.expectEqual(Closure.none, fill.figures[2].closure);
    try std.testing.expectEqual(Closure.explicit, stroke.figures[3].closure);
    try std.testing.expectEqual(Closure.explicit, fill.figures[3].closure);

    try std.testing.expectEqual(@as(usize, 9), stroke.points.len);
    try std.testing.expectEqual(@as(usize, 10), fill.points.len);
    const explicit_points = try stroke.pointsFor(0);
    try std.testing.expectEqual(@as(usize, 3), explicit_points.len);
    try std.testing.expect(explicit_points[0].source_type.?.point_type.path_marker);
    try std.testing.expect(explicit_points[1].source_type.?.point_type.dash_mode);
    try std.testing.expect(explicit_points[1].source_type.?.point_type.close_subpath);
    try std.testing.expectEqual(explicit_points[0].value, explicit_points[2].value);
    try std.testing.expect(explicit_points[2].source_type == null);
    const open_stroke = try stroke.pointsFor(1);
    try std.testing.expectEqual(@as(usize, 2), open_stroke.len);
    const open_fill = try fill.pointsFor(1);
    try std.testing.expectEqual(@as(usize, 3), open_fill.len);
    try std.testing.expectEqual(open_fill[0].value, open_fill[2].value);
    try std.testing.expect(open_fill[2].source_type == null);
    try std.testing.expectEqual(@as(usize, 1), (try fill.pointsFor(2)).len);
    const degenerate = try stroke.pointsFor(3);
    try std.testing.expectEqual(@as(usize, 3), degenerate.len);
    try std.testing.expectEqual(degenerate[0].value, degenerate[1].value);
    try std.testing.expectEqual(degenerate[1].value, degenerate[2].value);
    try std.testing.expectError(error.EmfPlusPathFigureIndexOutOfBounds, stroke.pointsFor(4));
    stroke.figures[3].points.count += 1;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundaryPointRange, stroke.pointsFor(3));
}

test "EMF+ Path boundary polyline enforces exact global limits and malformed source ranges" {
    const input = fixture();
    const source = sourceFrom(&input);
    var exact_stroke = try build(std.testing.allocator, source, .stroke, .{ .max_points = 9 });
    defer exact_stroke.deinit(std.testing.allocator);
    var exact_fill = try build(std.testing.allocator, source, .fill, .{ .max_points = 10 });
    defer exact_fill.deinit(std.testing.allocator);
    try std.testing.expectError(error.EmfPlusPathBoundaryPointLimitExceeded, build(std.testing.allocator, source, .stroke, .{ .max_points = 8 }));
    try std.testing.expectError(error.EmfPlusPathBoundaryPointLimitExceeded, build(std.testing.allocator, source, .fill, .{ .max_points = 9 }));
    var open_figure = input.figures[1];
    open_figure.source_points.start = 0;
    open_figure.source_commands.start = 0;
    open_figure.points.start = 0;
    var exact_open = try build(std.testing.allocator, .{
        .figures = @constCast((&[_]path_polyline.Figure{open_figure})[0..]),
        .commands = @constCast(input.commands[1..2]),
        .points = @constCast(input.points[2..4]),
    }, .stroke, .{ .max_points = 2 });
    defer exact_open.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), exact_open.points.len);

    var bad_figures = input.figures;
    bad_figures[1].points.start = 99;
    var malformed = source;
    malformed.figures = &bad_figures;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundarySourcePointRange, build(std.testing.allocator, malformed, .fill, .{}));
    bad_figures = input.figures;
    bad_figures[1].source_commands.count = 99;
    malformed.figures = &bad_figures;
    try std.testing.expectError(error.InvalidEmfPlusPathPolylineCommandRange, build(std.testing.allocator, malformed, .fill, .{}));
    bad_figures = input.figures;
    bad_figures[1].points.start = 1;
    malformed.figures = &bad_figures;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundarySourcePointRange, build(std.testing.allocator, malformed, .fill, .{}));
    bad_figures = input.figures;
    bad_figures[1].source_commands.start = 0;
    malformed.figures = &bad_figures;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundarySourceCommandRange, build(std.testing.allocator, malformed, .fill, .{}));
    bad_figures = input.figures;
    bad_figures[1].closed = true;
    malformed.figures = &bad_figures;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundarySourceClosure, build(std.testing.allocator, malformed, .fill, .{}));
    var bad_points = input.points;
    bad_points[0].value.x = 1;
    malformed = source;
    malformed.points = &bad_points;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundarySourceFigure, build(std.testing.allocator, malformed, .fill, .{}));
    var trailing_points: [8]path_polyline.Point = undefined;
    @memcpy(trailing_points[0..7], &input.points);
    trailing_points[7] = input.points[6];
    malformed = source;
    malformed.points = &trailing_points;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundarySourcePointRange, build(std.testing.allocator, malformed, .fill, .{}));
    var trailing_commands: [4]device_geometry.Command = undefined;
    @memcpy(trailing_commands[0..3], &input.commands);
    trailing_commands[3] = input.commands[2];
    malformed = source;
    malformed.commands = &trailing_commands;
    try std.testing.expectError(error.InvalidEmfPlusPathBoundarySourceCommandRange, build(std.testing.allocator, malformed, .fill, .{}));

    var empty = try build(std.testing.allocator, .{ .figures = &.{}, .commands = &.{}, .points = &.{} }, .fill, .{ .max_points = 0 });
    defer empty.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 0), empty.figures.len);
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    const input = fixture();
    var value = try build(allocator, sourceFrom(&input), .fill, .{});
    defer value.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 10), value.points.len);
}

test "EMF+ Path boundary polyline releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}

test "EMF+ Path boundary polyline releases success and limit-error allocations in every build mode" {
    var checked = std.heap.DebugAllocator(.{ .safety = true }){};
    const allocator = checked.allocator();
    const input = fixture();
    var value = try build(allocator, sourceFrom(&input), .fill, .{});
    value.deinit(allocator);
    try std.testing.expectError(error.EmfPlusPathBoundaryPointLimitExceeded, build(allocator, sourceFrom(&input), .fill, .{ .max_points = 2 }));
    try std.testing.expect(checked.deinit() == .ok);
}
