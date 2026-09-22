const std = @import("std");
const device_commands = @import("emf_plus_path_device_commands.zig");

pub const Options = struct {
    max_figures: usize = 16 * 1024 * 1024,
    max_commands: usize = 16 * 1024 * 1024,
    max_points: usize = 16 * 1024 * 1024,
};

pub const Range = struct {
    start: usize,
    count: usize,
};

pub const Command = union(enum) {
    line_to: device_commands.Line,
    bezier_to: device_commands.Bezier,
};

pub const Figure = struct {
    move_to: device_commands.TypedPoint,
    points: Range,
    commands: Range,
    closed: bool,
};

pub const Geometry = struct {
    figures: []Figure,
    commands: []Command,

    pub fn deinit(self: *Geometry, allocator: std.mem.Allocator) void {
        allocator.free(self.figures);
        allocator.free(self.commands);
        self.* = undefined;
    }

    pub fn commandsFor(self: Geometry, figure_index: usize) ![]const Command {
        if (figure_index >= self.figures.len) return error.EmfPlusPathFigureIndexOutOfBounds;
        const range = self.figures[figure_index].commands;
        return self.commands[range.start..][0..range.count];
    }
};

pub fn collect(allocator: std.mem.Allocator, source: device_commands.Iterator, options: Options) !Geometry {
    var iterator = source;
    var figures: std.ArrayList(Figure) = .empty;
    defer figures.deinit(allocator);
    var commands: std.ArrayList(Command) = .empty;
    defer commands.deinit(allocator);
    var active_figure: ?usize = null;
    var point_count: usize = 0;

    while (try iterator.next()) |command| {
        const source_point_count = command.sourcePointCount();
        switch (command) {
            .move_to => |move| {
                if (active_figure) |index| finishFigure(figures.items, index, commands.items.len, point_count, false);
                if (figures.items.len == options.max_figures) return error.EmfPlusPathFigureLimitExceeded;
                try ensurePointBudget(point_count, source_point_count, options.max_points);
                try figures.append(allocator, .{
                    .move_to = move,
                    .points = .{ .start = point_count, .count = 0 },
                    .commands = .{ .start = commands.items.len, .count = 0 },
                    .closed = move.point_type.point_type.close_subpath,
                });
                point_count += source_point_count;
                if (move.point_type.point_type.close_subpath) {
                    finishFigure(figures.items, figures.items.len - 1, commands.items.len, point_count, true);
                    active_figure = null;
                } else {
                    active_figure = figures.items.len - 1;
                }
            },
            .line_to => |line| {
                const index = active_figure orelse return error.InvalidEmfPlusPathDeviceCommandSequence;
                if (commands.items.len == options.max_commands) return error.EmfPlusPathCommandLimitExceeded;
                try ensurePointBudget(point_count, source_point_count, options.max_points);
                try commands.append(allocator, .{ .line_to = line });
                point_count += source_point_count;
                if (line.end.point_type.point_type.close_subpath) {
                    finishFigure(figures.items, index, commands.items.len, point_count, true);
                    active_figure = null;
                }
            },
            .bezier_to => |bezier| {
                const index = active_figure orelse return error.InvalidEmfPlusPathDeviceCommandSequence;
                if (commands.items.len == options.max_commands) return error.EmfPlusPathCommandLimitExceeded;
                try ensurePointBudget(point_count, source_point_count, options.max_points);
                try commands.append(allocator, .{ .bezier_to = bezier });
                point_count += source_point_count;
                if (bezier.end.point_type.point_type.close_subpath) {
                    finishFigure(figures.items, index, commands.items.len, point_count, true);
                    active_figure = null;
                }
            },
        }
    }
    if (active_figure) |index| finishFigure(figures.items, index, commands.items.len, point_count, false);

    const owned_figures = try figures.toOwnedSlice(allocator);
    errdefer allocator.free(owned_figures);
    return .{
        .figures = owned_figures,
        .commands = try commands.toOwnedSlice(allocator),
    };
}

fn ensurePointBudget(current: usize, additional: usize, maximum: usize) !void {
    if (current > maximum or additional > maximum - current)
        return error.EmfPlusPathPointLimitExceeded;
}

fn finishFigure(figures: []Figure, index: usize, command_end: usize, point_end: usize, closed: bool) void {
    figures[index].commands.count = command_end - figures[index].commands.start;
    figures[index].points.count = point_end - figures[index].points.start;
    figures[index].closed = closed;
}

const geometry = @import("emf_plus_geometry.zig");
const page_transform = @import("emf_plus_page_transform.zig");
const path_geometry = @import("emf_plus_path_geometry.zig");
const path_type = @import("emf_plus_path_type.zig");
const point = @import("emf_plus_point.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

fn commandIterator(point_bytes: []const u8, type_bytes: []const u8, count: u32, encoding: point.Encoding) device_commands.Iterator {
    const source = path_geometry.commands(
        .{ .reader = .{ .bytes = point_bytes }, .encoding = encoding, .remaining = count },
        .{ .reader = .{ .bytes = type_bytes }, .rle = false, .remaining = count },
    );
    const mapping = world_page_device.resolve(transform_matrix.TransformMatrix.translation(10, 20), page_transform.build(.pixel, 2, .{ .x = 96, .y = 96 })).?;
    return device_commands.fromCommands(source, mapping);
}

test "EMF+ Path device geometry owns figure point and command ranges without losing metadata" {
    var point_bytes = [_]u8{0} ** (9 * 4);
    for (0..9) |index| {
        std.mem.writeInt(i16, point_bytes[index * 4 ..][0..2], @intCast(index * 2 + 1), .little);
        std.mem.writeInt(i16, point_bytes[index * 4 + 2 ..][0..2], @intCast(index * 2 + 2), .little);
    }
    const types = [_]u8{ 0x20, 0x31, 0x13, 0x23, 0x83, 0xa0, 0x00, 0x11, 0x00 };
    var value = try collect(std.testing.allocator, commandIterator(&point_bytes, &types, 9, .integer), .{});
    defer value.deinit(std.testing.allocator);

    try std.testing.expectEqual(@as(usize, 4), value.figures.len);
    try std.testing.expectEqual(@as(usize, 3), value.commands.len);
    try std.testing.expectEqual(Range{ .start = 0, .count = 5 }, value.figures[0].points);
    try std.testing.expectEqual(Range{ .start = 0, .count = 2 }, value.figures[0].commands);
    try std.testing.expect(value.figures[0].closed);
    try std.testing.expect(value.figures[0].move_to.point_type.point_type.path_marker);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, value.figures[0].move_to.value);
    const first = try value.commandsFor(0);
    try std.testing.expect(first[0] == .line_to);
    try std.testing.expect(first[0].line_to.end.point_type.point_type.dash_mode);
    try std.testing.expect(first[0].line_to.end.point_type.point_type.path_marker);
    try std.testing.expect(first[1] == .bezier_to);
    try std.testing.expect(first[1].bezier_to.control1.point_type.point_type.dash_mode);
    try std.testing.expect(first[1].bezier_to.control2.point_type.point_type.path_marker);
    try std.testing.expect(first[1].bezier_to.end.point_type.point_type.close_subpath);

    try std.testing.expectEqual(Range{ .start = 5, .count = 1 }, value.figures[1].points);
    try std.testing.expectEqual(Range{ .start = 2, .count = 0 }, value.figures[1].commands);
    try std.testing.expect(value.figures[1].closed);
    try std.testing.expect(value.figures[1].move_to.point_type.point_type.path_marker);
    try std.testing.expectEqual(@as(usize, 0), (try value.commandsFor(1)).len);

    try std.testing.expectEqual(Range{ .start = 6, .count = 2 }, value.figures[2].points);
    try std.testing.expectEqual(Range{ .start = 2, .count = 1 }, value.figures[2].commands);
    try std.testing.expect(!value.figures[2].closed);
    const last = try value.commandsFor(2);
    try std.testing.expect(last[0] == .line_to);
    try std.testing.expect(last[0].line_to.end.point_type.point_type.dash_mode);
    try std.testing.expect(!last[0].line_to.end.point_type.point_type.path_marker);

    try std.testing.expectEqual(Range{ .start = 8, .count = 1 }, value.figures[3].points);
    try std.testing.expectEqual(Range{ .start = 3, .count = 0 }, value.figures[3].commands);
    try std.testing.expect(!value.figures[3].closed);
    try std.testing.expectEqual(@as(usize, 0), (try value.commandsFor(3)).len);
    try std.testing.expectError(error.EmfPlusPathFigureIndexOutOfBounds, value.commandsFor(4));
}

test "EMF+ Path device geometry enforces exact independent limits and empty input" {
    const point_bytes = [_]u8{0} ** (5 * 4);
    const types = [_]u8{ 0x00, 0x01, 0x03, 0x03, 0x83 };
    const source = commandIterator(&point_bytes, &types, 5, .integer);
    var exact = try collect(std.testing.allocator, source, .{ .max_figures = 1, .max_commands = 2, .max_points = 5 });
    defer exact.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 1), exact.figures.len);
    try std.testing.expectEqual(@as(usize, 2), exact.commands.len);
    try std.testing.expectError(error.EmfPlusPathFigureLimitExceeded, collect(std.testing.allocator, source, .{ .max_figures = 0, .max_commands = 2, .max_points = 5 }));
    try std.testing.expectError(error.EmfPlusPathCommandLimitExceeded, collect(std.testing.allocator, source, .{ .max_figures = 1, .max_commands = 1, .max_points = 5 }));
    try std.testing.expectError(error.EmfPlusPathPointLimitExceeded, collect(std.testing.allocator, source, .{ .max_figures = 1, .max_commands = 2, .max_points = 4 }));

    const move_bytes = [_]u8{0} ** 4;
    const move_types = [_]u8{0x00};
    try std.testing.expectError(error.EmfPlusPathPointLimitExceeded, collect(std.testing.allocator, commandIterator(&move_bytes, &move_types, 1, .integer), .{ .max_figures = 1, .max_commands = 0, .max_points = 0 }));
    const line_bytes = [_]u8{0} ** 8;
    const line_types = [_]u8{ 0x00, 0x01 };
    try std.testing.expectError(error.EmfPlusPathCommandLimitExceeded, collect(std.testing.allocator, commandIterator(&line_bytes, &line_types, 2, .integer), .{ .max_figures = 1, .max_commands = 0, .max_points = 2 }));
    try std.testing.expectError(error.EmfPlusPathPointLimitExceeded, collect(std.testing.allocator, commandIterator(&line_bytes, &line_types, 2, .integer), .{ .max_figures = 1, .max_commands = 1, .max_points = 1 }));

    var empty = try collect(std.testing.allocator, commandIterator(&.{}, &.{}, 0, .floating), .{ .max_figures = 0, .max_commands = 0, .max_points = 0 });
    defer empty.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 0), empty.figures.len);
    try std.testing.expectEqual(@as(usize, 0), empty.commands.len);

    const relative_points = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
    const bezier_types = [_]u8{ 0x00, 0x01, 0x03, 0x03, 0x03 };
    var malformed = commandIterator(&relative_points, &bezier_types, 5, .relative);
    malformed.source.points.source.reader.bytes = relative_points[0..9];
    try std.testing.expectError(error.UnexpectedEnd, collect(std.testing.allocator, malformed, .{}));

    const rle_points = [_]u8{ 1, 2, 3, 4 };
    const rle_types = [_]u8{ 0x41, 0x00, 0x41, 0x83 };
    const rle_source = path_geometry.commands(
        .{ .reader = .{ .bytes = &rle_points }, .encoding = .relative, .remaining = 2 },
        .{ .reader = .{ .bytes = &rle_types }, .rle = true, .remaining = 2 },
    );
    const mapping = world_page_device.resolve(transform_matrix.TransformMatrix.identity, page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 })).?;
    var rle = try collect(std.testing.allocator, device_commands.fromCommands(rle_source, mapping), .{});
    defer rle.deinit(std.testing.allocator);
    try std.testing.expect(rle.figures[0].move_to.point_type.rle_bezier != null);
    try std.testing.expectEqual(false, rle.figures[0].move_to.point_type.rle_bezier.?);
    try std.testing.expect(rle.commands[0].line_to.end.point_type.rle_bezier != null);
    try std.testing.expectEqual(false, rle.commands[0].line_to.end.point_type.rle_bezier.?);
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    const point_bytes = [_]u8{0} ** (5 * 4);
    const types = [_]u8{ 0x00, 0x01, 0x03, 0x03, 0x83 };
    var value = try collect(allocator, commandIterator(&point_bytes, &types, 5, .integer), .{});
    defer value.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 1), value.figures.len);
    try std.testing.expectEqual(@as(usize, 2), value.commands.len);
}

test "EMF+ Path device geometry releases every allocation failure path" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}

test "EMF+ Path device geometry releases success and source-error allocations in every build mode" {
    var checked = std.heap.DebugAllocator(.{ .safety = true }){};
    const allocator = checked.allocator();
    const point_bytes = [_]u8{0} ** (5 * 4);
    const types = [_]u8{ 0x00, 0x01, 0x03, 0x03, 0x83 };
    var value = try collect(allocator, commandIterator(&point_bytes, &types, 5, .integer), .{});
    value.deinit(allocator);

    const relative_points = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
    const bezier_types = [_]u8{ 0x00, 0x01, 0x03, 0x03, 0x03 };
    var malformed = commandIterator(&relative_points, &bezier_types, 5, .relative);
    malformed.source.points.source.reader.bytes = relative_points[0..9];
    try std.testing.expectError(error.UnexpectedEnd, collect(allocator, malformed, .{}));
    try std.testing.expect(checked.deinit() == .ok);
}
