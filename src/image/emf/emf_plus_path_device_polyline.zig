const std = @import("std");
const cubic_flattening = @import("emf_plus_cubic_flattening.zig");
const device_commands = @import("emf_plus_path_device_commands.zig");
const device_geometry = @import("emf_plus_path_device_geometry.zig");
const geometry = @import("emf_plus_geometry.zig");
const path_type = @import("emf_plus_path_type.zig");

pub const Options = struct {
    tolerance: f64,
    max_depth: u8 = 32,
    max_points: usize = 1_000_000,

    pub fn validate(self: Options) !void {
        if (!std.math.isFinite(self.tolerance) or self.tolerance <= 0)
            return error.InvalidEmfPlusCubicTolerance;
        if (self.max_depth > 64) return error.InvalidEmfPlusCubicDepthLimit;
    }
};

pub const CollectOptions = struct {
    geometry: device_geometry.Options = .{},
    flattening: Options,
};

pub const Point = struct {
    value: geometry.PointF,
    source_type: ?path_type.Value,
};

pub const Figure = struct {
    move_to: device_commands.TypedPoint,
    source_points: device_geometry.Range,
    source_commands: device_geometry.Range,
    points: device_geometry.Range,
    closed: bool,
};

pub const Geometry = struct {
    figures: []Figure,
    commands: []device_geometry.Command,
    points: []Point,

    pub fn deinit(self: *Geometry, allocator: std.mem.Allocator) void {
        allocator.free(self.figures);
        allocator.free(self.commands);
        allocator.free(self.points);
        self.* = undefined;
    }

    pub fn pointsFor(self: Geometry, figure_index: usize) ![]const Point {
        if (figure_index >= self.figures.len) return error.EmfPlusPathFigureIndexOutOfBounds;
        const range = self.figures[figure_index].points;
        if (range.start > self.points.len or range.count > self.points.len - range.start)
            return error.InvalidEmfPlusPathPolylinePointRange;
        return self.points[range.start..][0..range.count];
    }

    pub fn commandsFor(self: Geometry, figure_index: usize) ![]const device_geometry.Command {
        if (figure_index >= self.figures.len) return error.EmfPlusPathFigureIndexOutOfBounds;
        const range = self.figures[figure_index].source_commands;
        if (range.start > self.commands.len or range.count > self.commands.len - range.start)
            return error.InvalidEmfPlusPathPolylineCommandRange;
        return self.commands[range.start..][0..range.count];
    }
};

pub fn flatten(allocator: std.mem.Allocator, source: device_geometry.Geometry, options: Options) !Geometry {
    try options.validate();
    try validateSource(source);

    var figures: std.ArrayList(Figure) = .empty;
    defer figures.deinit(allocator);
    var points: std.ArrayList(Point) = .empty;
    defer points.deinit(allocator);

    for (source.figures) |source_figure| {
        const point_start = points.items.len;
        try appendPoint(allocator, &points, .{
            .value = source_figure.move_to.value,
            .source_type = source_figure.move_to.point_type,
        }, options.max_points);
        var current = source_figure.move_to.value;
        for (source.commands[source_figure.commands.start..][0..source_figure.commands.count]) |command| switch (command) {
            .line_to => |line| {
                if (!pointBitsEqual(current, line.start)) return error.DiscontinuousEmfPlusPathFigure;
                try appendPoint(allocator, &points, .{ .value = line.end.value, .source_type = line.end.point_type }, options.max_points);
                current = line.end.value;
            },
            .bezier_to => |bezier| {
                if (!pointBitsEqual(current, bezier.start)) return error.DiscontinuousEmfPlusPathFigure;
                const remaining = options.max_points - points.items.len;
                if (remaining == 0) return error.EmfPlusCubicPointLimitExceeded;
                var polyline = try bezier.flatten(allocator, .{
                    .tolerance = options.tolerance,
                    .max_depth = options.max_depth,
                    .max_points = remaining + 1,
                });
                defer polyline.deinit(allocator);
                if (!pointBitsEqual(polyline.points[0], current)) return error.DiscontinuousEmfPlusPathFigure;
                for (polyline.points[1 .. polyline.points.len - 1]) |value|
                    try appendPoint(allocator, &points, .{ .value = value, .source_type = null }, options.max_points);
                try appendPoint(allocator, &points, .{ .value = bezier.end.value, .source_type = bezier.end.point_type }, options.max_points);
                current = bezier.end.value;
            },
        };
        try figures.append(allocator, .{
            .move_to = source_figure.move_to,
            .source_points = source_figure.points,
            .source_commands = source_figure.commands,
            .points = .{ .start = point_start, .count = points.items.len - point_start },
            .closed = source_figure.closed,
        });
    }

    const owned_figures = try figures.toOwnedSlice(allocator);
    errdefer allocator.free(owned_figures);
    const owned_commands = try allocator.dupe(device_geometry.Command, source.commands);
    errdefer allocator.free(owned_commands);
    return .{
        .figures = owned_figures,
        .commands = owned_commands,
        .points = try points.toOwnedSlice(allocator),
    };
}

pub fn collect(allocator: std.mem.Allocator, source: device_commands.Iterator, options: CollectOptions) !Geometry {
    try options.flattening.validate();
    var owned_source = try device_geometry.collect(allocator, source, options.geometry);
    defer owned_source.deinit(allocator);
    return flatten(allocator, owned_source, options.flattening);
}

fn validateSource(source: device_geometry.Geometry) !void {
    var next_command: usize = 0;
    var next_source_point: usize = 0;
    for (source.figures) |figure| {
        if (figure.commands.start != next_command or figure.commands.count > source.commands.len - next_command)
            return error.InvalidEmfPlusPathFigureCommandRange;
        if (figure.points.start != next_source_point)
            return error.InvalidEmfPlusPathFigurePointRange;
        var source_point_count = figure.move_to.sourcePointCount();
        var current = figure.move_to.value;
        for (source.commands[next_command..][0..figure.commands.count]) |command| {
            switch (command) {
                .line_to => |line| {
                    if (!pointBitsEqual(line.figure_start, figure.move_to.value) or !pointBitsEqual(line.start, current))
                        return error.DiscontinuousEmfPlusPathFigure;
                    current = line.end.value;
                },
                .bezier_to => |bezier| {
                    if (!pointBitsEqual(bezier.figure_start, figure.move_to.value) or !pointBitsEqual(bezier.start, current))
                        return error.DiscontinuousEmfPlusPathFigure;
                    current = bezier.end.value;
                },
            }
            source_point_count = std.math.add(usize, source_point_count, command.sourcePointCount()) catch
                return error.InvalidEmfPlusPathFigurePointRange;
        }
        if (figure.points.count != source_point_count)
            return error.InvalidEmfPlusPathFigurePointRange;
        next_command += figure.commands.count;
        next_source_point = std.math.add(usize, next_source_point, source_point_count) catch
            return error.InvalidEmfPlusPathFigurePointRange;
    }
    if (next_command != source.commands.len) return error.InvalidEmfPlusPathFigureCommandRange;
}

fn appendPoint(allocator: std.mem.Allocator, points: *std.ArrayList(Point), point: Point, maximum: usize) !void {
    if (points.items.len == maximum) return error.EmfPlusCubicPointLimitExceeded;
    try points.append(allocator, point);
}

fn pointBitsEqual(left: geometry.PointF, right: geometry.PointF) bool {
    return @as(u32, @bitCast(left.x)) == @as(u32, @bitCast(right.x)) and
        @as(u32, @bitCast(left.y)) == @as(u32, @bitCast(right.y));
}

fn typeValue(raw: u8) path_type.Value {
    return .{ .point_type = path_type.parse(raw) catch unreachable, .rle_bezier = null };
}

fn fixture() struct { figures: [3]device_geometry.Figure, commands: [3]device_geometry.Command } {
    const move0: device_commands.TypedPoint = .{ .value = .{ .x = 0, .y = 0 }, .point_type = typeValue(0x20) };
    const move1: device_commands.TypedPoint = .{ .value = .{ .x = 20, .y = 20 }, .point_type = typeValue(0xa0) };
    const move2: device_commands.TypedPoint = .{ .value = .{ .x = 30, .y = 30 }, .point_type = typeValue(0x00) };
    return .{
        .figures = .{
            .{ .move_to = move0, .points = .{ .start = 0, .count = 5 }, .commands = .{ .start = 0, .count = 2 }, .closed = true },
            .{ .move_to = move1, .points = .{ .start = 5, .count = 1 }, .commands = .{ .start = 2, .count = 0 }, .closed = true },
            .{ .move_to = move2, .points = .{ .start = 6, .count = 2 }, .commands = .{ .start = 2, .count = 1 }, .closed = false },
        },
        .commands = .{
            .{ .line_to = .{ .start = move0.value, .end = .{ .value = .{ .x = 2, .y = 0 }, .point_type = typeValue(0x11) }, .figure_start = move0.value } },
            .{ .bezier_to = .{ .start = .{ .x = 2, .y = 0 }, .control1 = .{ .value = .{ .x = 2, .y = 8 }, .point_type = typeValue(0x13) }, .control2 = .{ .value = .{ .x = 8, .y = 8 }, .point_type = typeValue(0x23) }, .end = .{ .value = .{ .x = 8, .y = 0 }, .point_type = typeValue(0x83) }, .figure_start = move0.value } },
            .{ .line_to = .{ .start = move2.value, .end = .{ .value = .{ .x = 31, .y = 32 }, .point_type = typeValue(0x11) }, .figure_start = move2.value } },
        },
    };
}

test "EMF+ Path device polyline preserves figures source commands metadata and flattened order" {
    const input = fixture();
    var value = try flatten(std.testing.allocator, .{ .figures = @constCast(&input.figures), .commands = @constCast(&input.commands) }, .{ .tolerance = 0.5, .max_depth = 8, .max_points = 64 });
    defer value.deinit(std.testing.allocator);

    try std.testing.expectEqual(@as(usize, 3), value.figures.len);
    try std.testing.expectEqual(@as(usize, 3), value.commands.len);
    try std.testing.expectEqual(device_geometry.Range{ .start = 0, .count = 5 }, value.figures[0].source_points);
    try std.testing.expectEqual(device_geometry.Range{ .start = 0, .count = 2 }, value.figures[0].source_commands);
    try std.testing.expectEqual(@as(usize, 0), value.figures[0].points.start);
    try std.testing.expect(value.figures[0].points.count > 3);
    try std.testing.expectEqual(device_geometry.Range{ .start = 5, .count = 1 }, value.figures[1].source_points);
    try std.testing.expectEqual(device_geometry.Range{ .start = 2, .count = 0 }, value.figures[1].source_commands);
    try std.testing.expectEqual(@as(usize, 1), value.figures[1].points.count);
    try std.testing.expectEqual(device_geometry.Range{ .start = 6, .count = 2 }, value.figures[2].source_points);
    try std.testing.expectEqual(device_geometry.Range{ .start = 2, .count = 1 }, value.figures[2].source_commands);
    try std.testing.expectEqual(@as(usize, 2), value.figures[2].points.count);
    try std.testing.expect(value.figures[0].closed);
    const first = try value.pointsFor(0);
    try std.testing.expect(first.len > 3);
    try std.testing.expectEqual(geometry.PointF{ .x = 0, .y = 0 }, first[0].value);
    try std.testing.expect(first[0].source_type != null);
    try std.testing.expect(first[0].source_type.?.point_type.path_marker);
    try std.testing.expectEqual(geometry.PointF{ .x = 2, .y = 0 }, first[1].value);
    try std.testing.expect(first[1].source_type != null);
    try std.testing.expect(first[1].source_type.?.point_type.dash_mode);
    for (first[2 .. first.len - 1]) |generated| try std.testing.expect(generated.source_type == null);
    try std.testing.expectEqual(geometry.PointF{ .x = 8, .y = 0 }, first[first.len - 1].value);
    try std.testing.expect(first[first.len - 1].source_type != null);
    try std.testing.expect(first[first.len - 1].source_type.?.point_type.close_subpath);
    var canonical = try input.commands[1].bezier_to.flatten(std.testing.allocator, .{ .tolerance = 0.5, .max_depth = 8, .max_points = 64 });
    defer canonical.deinit(std.testing.allocator);
    try std.testing.expectEqual(canonical.points.len - 1, first.len - 2);
    for (canonical.points[1..], first[2..]) |expected, actual| try std.testing.expectEqual(expected, actual.value);
    const commands = try value.commandsFor(0);
    try std.testing.expect(commands[1].bezier_to.control1.point_type.point_type.dash_mode);
    try std.testing.expect(commands[1].bezier_to.control2.point_type.point_type.path_marker);

    const empty = try value.pointsFor(1);
    try std.testing.expectEqual(@as(usize, 1), empty.len);
    try std.testing.expect(empty[0].source_type != null);
    try std.testing.expect(empty[0].source_type.?.point_type.close_subpath);
    const last = try value.pointsFor(2);
    try std.testing.expectEqual(@as(usize, 2), last.len);
    try std.testing.expect(!value.figures[2].closed);
    try std.testing.expectEqual(geometry.PointF{ .x = 31, .y = 32 }, last[1].value);
    try std.testing.expectError(error.EmfPlusPathFigureIndexOutOfBounds, value.pointsFor(3));
    try std.testing.expectError(error.EmfPlusPathFigureIndexOutOfBounds, value.commandsFor(3));
    value.figures[2].points.count += 1;
    try std.testing.expectError(error.InvalidEmfPlusPathPolylinePointRange, value.pointsFor(2));
    value.figures[2].source_commands.start += 1;
    try std.testing.expectError(error.InvalidEmfPlusPathPolylineCommandRange, value.commandsFor(2));
}

test "EMF+ Path device polyline validates global budget options ranges and continuity" {
    const input = fixture();
    const source: device_geometry.Geometry = .{ .figures = @constCast(&input.figures), .commands = @constCast(&input.commands) };
    var baseline = try flatten(std.testing.allocator, source, .{ .tolerance = 0.5, .max_depth = 8, .max_points = 64 });
    defer baseline.deinit(std.testing.allocator);
    var exact = try flatten(std.testing.allocator, source, .{ .tolerance = 0.5, .max_depth = 8, .max_points = baseline.points.len });
    defer exact.deinit(std.testing.allocator);
    try std.testing.expectEqualSlices(Point, baseline.points, exact.points);
    try std.testing.expectError(error.EmfPlusCubicPointLimitExceeded, flatten(std.testing.allocator, source, .{ .tolerance = 0.5, .max_depth = 8, .max_points = baseline.points.len - 1 }));
    try std.testing.expectError(error.InvalidEmfPlusCubicTolerance, flatten(std.testing.allocator, source, .{ .tolerance = 0 }));
    try std.testing.expectError(error.InvalidEmfPlusCubicDepthLimit, flatten(std.testing.allocator, source, .{ .tolerance = 1, .max_depth = 65 }));
    const no_figures: device_geometry.Geometry = .{ .figures = &.{}, .commands = &.{} };
    try std.testing.expectError(error.InvalidEmfPlusCubicTolerance, flatten(std.testing.allocator, no_figures, .{ .tolerance = 0 }));
    try std.testing.expectError(error.InvalidEmfPlusCubicDepthLimit, flatten(std.testing.allocator, no_figures, .{ .tolerance = 1, .max_depth = 65 }));

    var bad_figures = input.figures;
    bad_figures[1].commands.start = 1;
    try std.testing.expectError(error.InvalidEmfPlusPathFigureCommandRange, flatten(std.testing.allocator, .{ .figures = &bad_figures, .commands = @constCast(&input.commands) }, .{ .tolerance = 1 }));
    var bad_commands = input.commands;
    bad_commands[2].line_to.start.x = 29;
    try std.testing.expectError(error.DiscontinuousEmfPlusPathFigure, flatten(std.testing.allocator, .{ .figures = @constCast(&input.figures), .commands = &bad_commands }, .{ .tolerance = 1 }));
    bad_commands = input.commands;
    bad_commands[2].line_to.figure_start.x = 29;
    try std.testing.expectError(error.DiscontinuousEmfPlusPathFigure, flatten(std.testing.allocator, .{ .figures = @constCast(&input.figures), .commands = &bad_commands }, .{ .tolerance = 1 }));
    bad_figures = input.figures;
    bad_figures[2].points.count = 1;
    try std.testing.expectError(error.InvalidEmfPlusPathFigurePointRange, flatten(std.testing.allocator, .{ .figures = &bad_figures, .commands = @constCast(&input.commands) }, .{ .tolerance = 1 }));

    var empty = try flatten(std.testing.allocator, .{ .figures = &.{}, .commands = &.{} }, .{ .tolerance = 1, .max_points = 0 });
    defer empty.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 0), empty.points.len);
}

test "EMF+ Path device polyline keeps a collapsed Bezier endpoint and its metadata" {
    const move: device_commands.TypedPoint = .{ .value = .{ .x = 4, .y = 5 }, .point_type = typeValue(0x00) };
    var figures = [_]device_geometry.Figure{.{
        .move_to = move,
        .points = .{ .start = 0, .count = 4 },
        .commands = .{ .start = 0, .count = 1 },
        .closed = true,
    }};
    var commands = [_]device_geometry.Command{.{ .bezier_to = .{
        .start = move.value,
        .control1 = .{ .value = move.value, .point_type = typeValue(0x13) },
        .control2 = .{ .value = move.value, .point_type = typeValue(0x23) },
        .end = .{ .value = move.value, .point_type = typeValue(0x83) },
        .figure_start = move.value,
    } }};
    var value = try flatten(std.testing.allocator, .{ .figures = &figures, .commands = &commands }, .{ .tolerance = 1, .max_points = 2 });
    defer value.deinit(std.testing.allocator);
    const points = try value.pointsFor(0);
    try std.testing.expectEqual(@as(usize, 2), points.len);
    try std.testing.expectEqual(points[0].value, points[1].value);
    try std.testing.expect(points[0].source_type != null);
    try std.testing.expect(points[1].source_type != null);
    try std.testing.expect(points[1].source_type.?.point_type.close_subpath);
    try std.testing.expectEqual(@as(usize, 1), value.commands.len);
    try std.testing.expectEqual(@as(usize, 1), value.figures[0].source_commands.count);
    const commands_for_figure = try value.commandsFor(0);
    try std.testing.expectEqual(@as(usize, 1), commands_for_figure.len);
    try std.testing.expect(commands_for_figure[0].bezier_to.control2.point_type.point_type.path_marker);
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    const input = fixture();
    var value = try flatten(allocator, .{ .figures = @constCast(&input.figures), .commands = @constCast(&input.commands) }, .{ .tolerance = 0.1, .max_depth = 16, .max_points = 128 });
    defer value.deinit(allocator);
    try std.testing.expect(value.points.len > 6);
}

test "EMF+ Path device polyline releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}

test "EMF+ Path device polyline releases success and flattening-error allocations in every build mode" {
    var checked = std.heap.DebugAllocator(.{ .safety = true }){};
    const allocator = checked.allocator();
    const input = fixture();
    var value = try flatten(allocator, .{ .figures = @constCast(&input.figures), .commands = @constCast(&input.commands) }, .{ .tolerance = 1, .max_points = 64 });
    value.deinit(allocator);
    try std.testing.expectError(error.EmfPlusCubicPointLimitExceeded, flatten(allocator, .{ .figures = @constCast(&input.figures), .commands = @constCast(&input.commands) }, .{ .tolerance = 0.1, .max_points = 2 }));
    try std.testing.expect(checked.deinit() == .ok);
}
