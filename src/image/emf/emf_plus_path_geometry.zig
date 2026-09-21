const path_type = @import("emf_plus_path_type.zig");
const point = @import("emf_plus_point.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");

pub const TypedPoint = struct {
    value: resolved.Value,
    point_type: path_type.Value,
};

pub const Line = struct {
    start: resolved.Value,
    end: TypedPoint,
    figure_start: resolved.Value,
};

pub const Bezier = struct {
    start: resolved.Value,
    control1: TypedPoint,
    control2: TypedPoint,
    end: TypedPoint,
    figure_start: resolved.Value,
};

pub const Command = union(enum) {
    move_to: TypedPoint,
    line_to: Line,
    bezier_to: Bezier,
};

pub const Iterator = struct {
    points: resolved.Iterator,
    types: path_type.Iterator,
    current: ?resolved.Value = null,
    figure_start: ?resolved.Value = null,
    needs_start: bool = true,

    pub fn next(self: *Iterator) !?Command {
        if (self.points.source.remaining == 0 and self.types.remaining == 0) return null;
        if (self.points.source.remaining == 0 or self.types.remaining == 0)
            return error.InvalidEmfPlusPathGeometryCount;

        var pending = self.*;
        const first = try pending.readTyped();
        const kind = effectiveKind(first.point_type);
        if (pending.needs_start and kind != .start)
            return error.InvalidEmfPlusPathFigureStart;

        switch (kind) {
            .start => {
                pending.current = first.value;
                pending.figure_start = first.value;
                pending.needs_start = first.point_type.point_type.close_subpath;
                self.* = pending;
                return .{ .move_to = first };
            },
            .line => {
                const result: Line = .{
                    .start = pending.current.?,
                    .end = first,
                    .figure_start = pending.figure_start.?,
                };
                pending.current = first.value;
                pending.needs_start = first.point_type.point_type.close_subpath;
                self.* = pending;
                return .{ .line_to = result };
            },
            .bezier => {
                if (first.point_type.point_type.close_subpath)
                    return error.InvalidEmfPlusPathBezierControlFlags;
                const control2 = try pending.readTyped();
                const end = try pending.readTyped();
                if (effectiveKind(control2.point_type) != .bezier or effectiveKind(end.point_type) != .bezier)
                    return error.InvalidEmfPlusPathBezierSequence;
                if (control2.point_type.point_type.close_subpath)
                    return error.InvalidEmfPlusPathBezierControlFlags;
                const result: Bezier = .{
                    .start = pending.current.?,
                    .control1 = first,
                    .control2 = control2,
                    .end = end,
                    .figure_start = pending.figure_start.?,
                };
                pending.current = end.value;
                pending.needs_start = end.point_type.point_type.close_subpath;
                self.* = pending;
                return .{ .bezier_to = result };
            },
        }
    }

    fn readTyped(self: *Iterator) !TypedPoint {
        const value = try self.points.next() orelse return error.InvalidEmfPlusPathGeometryCount;
        const value_type = try self.types.next() orelse return error.InvalidEmfPlusPathGeometryCount;
        return .{ .value = value, .point_type = value_type };
    }
};

pub fn commands(points: point.Iterator, types: path_type.Iterator) Iterator {
    return .{ .points = resolved.fromIterator(points), .types = types };
}

fn effectiveKind(value: path_type.Value) path_type.Kind {
    if (value.point_type.kind == .start) return .start;
    return if (value.rle_bezier) |bezier|
        if (bezier) .bezier else .line
    else
        value.point_type.kind;
}

const std = @import("std");

fn pointIterator(bytes: []const u8, count: u32, encoding: point.Encoding) point.Iterator {
    return .{ .reader = .{ .bytes = bytes }, .encoding = encoding, .remaining = count };
}

fn typeIterator(bytes: []const u8, count: u32, rle: bool) path_type.Iterator {
    return .{ .reader = .{ .bytes = bytes }, .rle = rle, .remaining = count };
}

fn expectCommand(iterator: *Iterator) !Command {
    const value = try iterator.next();
    try std.testing.expect(value != null);
    return value.?;
}

fn expectMove(iterator: *Iterator) !TypedPoint {
    const command = try expectCommand(iterator);
    try std.testing.expect(command == .move_to);
    return command.move_to;
}

fn expectLine(iterator: *Iterator) !Line {
    const command = try expectCommand(iterator);
    try std.testing.expect(command == .line_to);
    return command.line_to;
}

fn expectBezier(iterator: *Iterator) !Bezier {
    const command = try expectCommand(iterator);
    try std.testing.expect(command == .bezier_to);
    return command.bezier_to;
}

test "EMF+ Path geometry assembles line Bezier figure boundaries and closure metadata" {
    var point_bytes = [_]u8{0} ** (8 * 4);
    for (0..8) |index| {
        std.mem.writeInt(i16, point_bytes[index * 4 ..][0..2], @intCast(index * 2), .little);
        std.mem.writeInt(i16, point_bytes[index * 4 + 2 ..][0..2], @intCast(index * 2 + 1), .little);
    }
    const types = [_]u8{ 0x20, 0x11, 0x91, 0x00, 0x13, 0x23, 0x83, 0x80 };
    var iterator = commands(pointIterator(&point_bytes, 8, .integer), typeIterator(&types, 8, false));

    const first_move = try expectMove(&iterator);
    try std.testing.expect(first_move.point_type.point_type.path_marker);
    const line = try expectLine(&iterator);
    try std.testing.expectEqual(@as(i64, 0), line.start.integer.x);
    try std.testing.expectEqual(@as(i64, 2), line.end.value.integer.x);
    try std.testing.expect(line.end.point_type.point_type.dash_mode);
    try std.testing.expect(!line.end.point_type.point_type.close_subpath);
    try std.testing.expectEqual(@as(i64, 0), line.figure_start.integer.x);
    const closing_line = try expectLine(&iterator);
    try std.testing.expectEqual(@as(i64, 2), closing_line.start.integer.x);
    try std.testing.expectEqual(@as(i64, 4), closing_line.end.value.integer.x);
    try std.testing.expect(closing_line.end.point_type.point_type.close_subpath);
    try std.testing.expectEqual(@as(i64, 0), closing_line.figure_start.integer.x);

    _ = try expectMove(&iterator);
    const bezier = try expectBezier(&iterator);
    try std.testing.expectEqual(@as(i64, 6), bezier.start.integer.x);
    try std.testing.expectEqual(@as(i64, 8), bezier.control1.value.integer.x);
    try std.testing.expectEqual(@as(i64, 10), bezier.control2.value.integer.x);
    try std.testing.expectEqual(@as(i64, 12), bezier.end.value.integer.x);
    try std.testing.expect(bezier.end.point_type.point_type.close_subpath);
    try std.testing.expectEqual(@as(i64, 6), bezier.figure_start.integer.x);

    const closed_move = try expectMove(&iterator);
    try std.testing.expect(closed_move.point_type.point_type.close_subpath);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path geometry resolves PointR and uses the RLE B bit for segment kind" {
    const point_bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
    const type_bytes = [_]u8{ 0x41, 0x00, 0x41, 0x83, 0x41, 0x00, 0xc3, 0x01 };
    var iterator = commands(pointIterator(&point_bytes, 6, .relative), typeIterator(&type_bytes, 6, true));
    _ = try expectMove(&iterator);
    const line = try expectLine(&iterator);
    try std.testing.expectEqual(@as(i64, 4), line.end.value.integer.x);
    try std.testing.expectEqual(path_type.Kind.bezier, line.end.point_type.point_type.kind);
    try std.testing.expectEqual(false, line.end.point_type.rle_bezier.?);
    try std.testing.expect(line.end.point_type.point_type.close_subpath);
    _ = try expectMove(&iterator);
    const bezier = try expectBezier(&iterator);
    try std.testing.expectEqual(@as(i64, 16), bezier.control1.value.integer.x);
    try std.testing.expectEqual(@as(i64, 36), bezier.end.value.integer.x);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path geometry rejects missing starts malformed Bezier groups and post-close continuation" {
    const points = [_]u8{0} ** 20;
    for ([_][]const u8{
        &.{0x01},
        &.{ 0x00, 0x83, 0x03, 0x03 },
        &.{ 0x00, 0x03, 0x83, 0x03 },
        &.{ 0x00, 0x03, 0x01, 0x03 },
        &.{ 0x00, 0x03, 0x03 },
        &.{ 0x00, 0x81, 0x01 },
        &.{ 0x00, 0x03, 0x03, 0x83, 0x01 },
    }, 0..) |types, index| {
        const count: u32 = @intCast(types.len);
        var iterator = commands(pointIterator(points[0 .. types.len * 4], count, .integer), typeIterator(types, count, false));
        if (index != 0) _ = try expectMove(&iterator);
        if (index == 5) _ = try expectLine(&iterator);
        if (index == 6) _ = try expectBezier(&iterator);
        const expected = switch (index) {
            0, 5, 6 => error.InvalidEmfPlusPathFigureStart,
            1, 2 => error.InvalidEmfPlusPathBezierControlFlags,
            3 => error.InvalidEmfPlusPathBezierSequence,
            else => error.InvalidEmfPlusPathGeometryCount,
        };
        try std.testing.expectError(expected, iterator.next());
    }
}

test "EMF+ Path geometry keeps point type and relative state atomic on truncated Bezier" {
    const point_bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const types = [_]u8{ 0, 3, 3, 3 };
    var iterator = commands(pointIterator(&point_bytes, 4, .relative), typeIterator(&types, 4, false));
    _ = try expectMove(&iterator);
    iterator.points.source.reader.bytes = point_bytes[0..7];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqual(before.points.source.reader.offset, iterator.points.source.reader.offset);
    try std.testing.expectEqual(before.points.source.remaining, iterator.points.source.remaining);
    try std.testing.expectEqual(before.points.previous_relative, iterator.points.previous_relative);
    try std.testing.expectEqual(before.types.reader.offset, iterator.types.reader.offset);
    try std.testing.expectEqual(before.types.remaining, iterator.types.remaining);
    try std.testing.expectEqual(before.current, iterator.current);
    try std.testing.expectEqual(before.figure_start, iterator.figure_start);
    try std.testing.expectEqual(before.needs_start, iterator.needs_start);
}
