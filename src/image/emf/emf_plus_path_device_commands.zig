const std = @import("std");
const cubic_derivative = @import("emf_plus_cubic_derivative.zig");
const cubic_evaluation = @import("emf_plus_cubic_evaluation.zig");
const cubic_flatness = @import("emf_plus_cubic_flatness.zig");
const cubic_flattening = @import("emf_plus_cubic_flattening.zig");
const cubic_subdivision = @import("emf_plus_cubic_subdivision.zig");
const geometry = @import("emf_plus_geometry.zig");
const path_geometry = @import("emf_plus_path_geometry.zig");
const path_type = @import("emf_plus_path_type.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const TypedPoint = struct {
    value: geometry.PointF,
    point_type: path_type.Value,

    pub fn sourcePointCount(_: TypedPoint) usize {
        return 1;
    }
};

pub const Line = struct {
    start: geometry.PointF,
    end: TypedPoint,
    figure_start: geometry.PointF,

    pub fn sourcePointCount(_: Line) usize {
        return 1;
    }
};

pub const Bezier = struct {
    start: geometry.PointF,
    control1: TypedPoint,
    control2: TypedPoint,
    end: TypedPoint,
    figure_start: geometry.PointF,

    pub fn sourcePointCount(_: Bezier) usize {
        return 3;
    }

    pub fn pointAt(self: Bezier, parameter: f32) !geometry.PointF {
        return cubic_evaluation.evaluate(self.cubic(), parameter);
    }

    pub fn splitAt(self: Bezier, parameter: f32) !cubic_subdivision.Split {
        return cubic_subdivision.split(self.cubic(), parameter);
    }

    pub fn tangentAt(self: Bezier, parameter: f32) !geometry.PointF {
        return cubic_derivative.evaluate(self.cubic(), parameter);
    }

    pub fn maximumControlDistanceSquared(self: Bezier) !f64 {
        return cubic_flatness.maximumControlDistanceSquared(self.cubic());
    }

    pub fn flatten(self: Bezier, allocator: std.mem.Allocator, options: cubic_flattening.Options) !cubic_flattening.Polyline {
        return cubic_flattening.flatten(allocator, self.cubic(), options);
    }

    fn cubic(self: Bezier) cubic_evaluation.Cubic {
        return .{
            .start = self.start,
            .control1 = self.control1.value,
            .control2 = self.control2.value,
            .end = self.end.value,
        };
    }
};

pub const Command = union(enum) {
    move_to: TypedPoint,
    line_to: Line,
    bezier_to: Bezier,

    pub fn sourcePointCount(self: Command) usize {
        return switch (self) {
            .move_to => |move| move.sourcePointCount(),
            .line_to => |line| line.sourcePointCount(),
            .bezier_to => |bezier| bezier.sourcePointCount(),
        };
    }
};

pub const Iterator = struct {
    source: path_geometry.Iterator,
    mapping: world_page_device.Mapper,

    pub fn next(self: *Iterator) !?Command {
        var pending = self.*;
        const source_command = try pending.source.next() orelse {
            self.* = pending;
            return null;
        };
        const result = mapCommand(source_command, pending.mapping);
        self.* = pending;
        return result;
    }
};

pub fn fromCommands(source: path_geometry.Iterator, mapping: world_page_device.Mapper) Iterator {
    return .{ .source = source, .mapping = mapping };
}

pub fn mapCommand(source: path_geometry.Command, mapping: world_page_device.Mapper) Command {
    return switch (source) {
        .move_to => |move| .{ .move_to = mapTyped(move, mapping) },
        .line_to => |line| .{ .line_to = mapLine(line, mapping) },
        .bezier_to => |bezier| .{ .bezier_to = mapBezier(bezier, mapping) },
    };
}

pub fn mapTyped(source: path_geometry.TypedPoint, mapping: world_page_device.Mapper) TypedPoint {
    return .{ .value = mapping.mapResolved(source.value), .point_type = source.point_type };
}

pub fn mapLine(source: path_geometry.Line, mapping: world_page_device.Mapper) Line {
    return .{
        .start = mapping.mapResolved(source.start),
        .end = mapTyped(source.end, mapping),
        .figure_start = mapping.mapResolved(source.figure_start),
    };
}

pub fn mapBezier(source: path_geometry.Bezier, mapping: world_page_device.Mapper) Bezier {
    return .{
        .start = mapping.mapResolved(source.start),
        .control1 = mapTyped(source.control1, mapping),
        .control2 = mapTyped(source.control2, mapping),
        .end = mapTyped(source.end, mapping),
        .figure_start = mapping.mapResolved(source.figure_start),
    };
}

const page_transform = @import("emf_plus_page_transform.zig");
const point = @import("emf_plus_point.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

fn commands(point_bytes: []const u8, type_bytes: []const u8, count: u32, encoding: point.Encoding) path_geometry.Iterator {
    return path_geometry.commands(
        .{ .reader = .{ .bytes = point_bytes }, .encoding = encoding, .remaining = count },
        .{ .reader = .{ .bytes = type_bytes }, .rle = false, .remaining = count },
    );
}

fn expectNext(iterator: *Iterator) !Command {
    const value = try iterator.next();
    try std.testing.expect(value != null);
    return value.?;
}

test "EMF+ Path device commands preserve moves roles metadata and coordinate mapping" {
    var point_bytes = [_]u8{0} ** 24;
    for ([_]i16{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, point_bytes[index * 2 ..][0..2], coordinate, .little);
    const types = [_]u8{ 0x20, 0x31, 0x13, 0x23, 0x83, 0xa0 };
    const mapping = world_page_device.resolve(transform_matrix.TransformMatrix.translation(10, 20), page_transform.build(.pixel, 2, .{ .x = 96, .y = 96 })).?;
    var iterator = fromCommands(commands(&point_bytes, &types, 6, .integer), mapping);

    const move = try expectNext(&iterator);
    try std.testing.expect(move == .move_to);
    try std.testing.expectEqual(@as(usize, 1), move.sourcePointCount());
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, move.move_to.value);
    try std.testing.expect(move.move_to.point_type.point_type.path_marker);

    const line = try expectNext(&iterator);
    try std.testing.expect(line == .line_to);
    try std.testing.expectEqual(@as(usize, 1), line.sourcePointCount());
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, line.line_to.start);
    try std.testing.expectEqual(geometry.PointF{ .x = 26, .y = 48 }, line.line_to.end.value);
    try std.testing.expect(line.line_to.end.point_type.point_type.dash_mode);
    try std.testing.expect(line.line_to.end.point_type.point_type.path_marker);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, line.line_to.figure_start);

    const bezier = try expectNext(&iterator);
    try std.testing.expect(bezier == .bezier_to);
    try std.testing.expectEqual(@as(usize, 3), bezier.sourcePointCount());
    try std.testing.expectEqual(geometry.PointF{ .x = 26, .y = 48 }, bezier.bezier_to.start);
    try std.testing.expectEqual(geometry.PointF{ .x = 30, .y = 52 }, bezier.bezier_to.control1.value);
    try std.testing.expect(bezier.bezier_to.control1.point_type.point_type.dash_mode);
    try std.testing.expectEqual(geometry.PointF{ .x = 34, .y = 56 }, bezier.bezier_to.control2.value);
    try std.testing.expect(bezier.bezier_to.control2.point_type.point_type.path_marker);
    try std.testing.expectEqual(geometry.PointF{ .x = 38, .y = 60 }, bezier.bezier_to.end.value);
    try std.testing.expect(bezier.bezier_to.end.point_type.point_type.close_subpath);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, bezier.bezier_to.figure_start);

    const empty_closed_move = try expectNext(&iterator);
    try std.testing.expect(empty_closed_move == .move_to);
    try std.testing.expectEqual(geometry.PointF{ .x = 42, .y = 64 }, empty_closed_move.move_to.value);
    try std.testing.expect(empty_closed_move.move_to.point_type.point_type.path_marker);
    try std.testing.expect(empty_closed_move.move_to.point_type.point_type.close_subpath);
    try std.testing.expect((try iterator.next()) == null);

    const relative_points = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const rle_types = [_]u8{ 0x41, 0x00, 0x41, 0x83, 0x41, 0x00 };
    var rle_iterator = fromCommands(path_geometry.commands(
        .{ .reader = .{ .bytes = &relative_points }, .encoding = .relative, .remaining = 2 },
        .{ .reader = .{ .bytes = &rle_types }, .rle = true, .remaining = 2 },
    ), world_page_device.resolve(transform_matrix.TransformMatrix.identity, page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 })).?);
    const rle_move = try expectNext(&rle_iterator);
    try std.testing.expect(rle_move == .move_to);
    try std.testing.expect(rle_move.move_to.point_type.rle_bezier != null);
    try std.testing.expectEqual(false, rle_move.move_to.point_type.rle_bezier.?);
    const rle_line = try expectNext(&rle_iterator);
    try std.testing.expect(rle_line == .line_to);
    try std.testing.expectEqual(path_type.Kind.bezier, rle_line.line_to.end.point_type.point_type.kind);
    try std.testing.expect(rle_line.line_to.end.point_type.rle_bezier != null);
    try std.testing.expectEqual(false, rle_line.line_to.end.point_type.rle_bezier.?);
    try std.testing.expect(rle_line.line_to.end.point_type.point_type.close_subpath);
    try std.testing.expect((try rle_iterator.next()) == null);

    var empty = fromCommands(commands(&.{}, &.{}, 0, .floating), mapping);
    try std.testing.expect((try empty.next()) == null);
    try std.testing.expect((try empty.next()) == null);
}

test "EMF+ Path device commands keep source errors atomic" {
    const point_bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const types = [_]u8{ 0x00, 0x03, 0x03, 0x03 };
    const mapping = world_page_device.resolve(transform_matrix.TransformMatrix.identity, page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 })).?;
    var iterator = fromCommands(commands(&point_bytes, &types, 4, .relative), mapping);
    const move = try expectNext(&iterator);
    try std.testing.expect(move == .move_to);
    iterator.source.points.source.reader.bytes = point_bytes[0..7];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
}
