const geometry = @import("emf_plus_geometry.zig");
const cubic_evaluation = @import("emf_plus_cubic_evaluation.zig");
const cubic_subdivision = @import("emf_plus_cubic_subdivision.zig");
const path_fill_segments = @import("emf_plus_path_fill_segments.zig");
const path_geometry = @import("emf_plus_path_geometry.zig");
const path_segments = @import("emf_plus_path_segments.zig");
const path_type = @import("emf_plus_path_type.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

pub const TypedPoint = struct {
    value: geometry.PointF,
    point_type: path_type.Value,
};

pub const Line = struct {
    start: geometry.PointF,
    end: TypedPoint,
    figure_start: geometry.PointF,
};

pub const Bezier = struct {
    start: geometry.PointF,
    control1: TypedPoint,
    control2: TypedPoint,
    end: TypedPoint,
    figure_start: geometry.PointF,

    pub fn pointAt(self: Bezier, parameter: f32) !geometry.PointF {
        return cubic_evaluation.evaluate(self.cubic(), parameter);
    }

    pub fn splitAt(self: Bezier, parameter: f32) !cubic_subdivision.Split {
        return cubic_subdivision.split(self.cubic(), parameter);
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

pub const ClosingLine = struct {
    start: geometry.PointF,
    end: geometry.PointF,
};

pub const Segment = union(enum) {
    line_to: Line,
    bezier_to: Bezier,
    close_figure: ClosingLine,
};

pub fn DeviceIterator(comptime Source: type) type {
    return struct {
        source: Source,
        mapping: world_page_device.Mapper,

        pub fn next(self: *@This()) !?Segment {
            var pending = self.*;
            const source_segment = try pending.source.next() orelse {
                self.* = pending;
                return null;
            };
            const result = mapSegment(source_segment, pending.mapping);
            self.* = pending;
            return result;
        }
    };
}

pub const StrokeIterator = DeviceIterator(path_segments.Iterator);
pub const FillIterator = DeviceIterator(path_fill_segments.Iterator);

pub fn fromSegments(source: anytype, mapping: world_page_device.Mapper) DeviceIterator(@TypeOf(source)) {
    return .{ .source = source, .mapping = mapping };
}

fn mapSegment(source: path_segments.Segment, mapping: world_page_device.Mapper) Segment {
    return switch (source) {
        .line_to => |line| .{ .line_to = mapLine(line, mapping) },
        .bezier_to => |bezier| .{ .bezier_to = mapBezier(bezier, mapping) },
        .close_figure => |closing| .{ .close_figure = .{
            .start = mapping.mapResolved(closing.start),
            .end = mapping.mapResolved(closing.end),
        } },
    };
}

fn mapTyped(source: path_geometry.TypedPoint, mapping: world_page_device.Mapper) TypedPoint {
    return .{ .value = mapping.mapResolved(source.value), .point_type = source.point_type };
}

fn mapLine(source: path_geometry.Line, mapping: world_page_device.Mapper) Line {
    return .{
        .start = mapping.mapResolved(source.start),
        .end = mapTyped(source.end, mapping),
        .figure_start = mapping.mapResolved(source.figure_start),
    };
}

fn mapBezier(source: path_geometry.Bezier, mapping: world_page_device.Mapper) Bezier {
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
const std = @import("std");

fn commands(point_bytes: []const u8, type_bytes: []const u8, count: u32, encoding: point.Encoding) path_geometry.Iterator {
    return path_geometry.commands(
        .{ .reader = .{ .bytes = point_bytes }, .encoding = encoding, .remaining = count },
        .{ .reader = .{ .bytes = type_bytes }, .rle = false, .remaining = count },
    );
}

fn expectNext(iterator: anytype) !Segment {
    const value = try iterator.next();
    try std.testing.expect(value != null);
    return value.?;
}

test "EMF+ Path device segments preserve Line Bezier closure roles metadata and coordinate mapping" {
    var point_bytes = [_]u8{0} ** 20;
    for ([_]i16{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, point_bytes[index * 2 ..][0..2], coordinate, .little);
    const types = [_]u8{ 0x20, 0x31, 0x13, 0x23, 0x83 };
    const world = transform_matrix.TransformMatrix.translation(10, 20);
    const page = page_transform.build(.pixel, 2, .{ .x = 96, .y = 96 });
    var iterator = fromSegments(path_segments.segments(commands(&point_bytes, &types, 5, .integer)), world_page_device.resolve(world, page).?);

    const line = try expectNext(&iterator);
    try std.testing.expect(line == .line_to);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, line.line_to.start);
    try std.testing.expectEqual(geometry.PointF{ .x = 26, .y = 48 }, line.line_to.end.value);
    try std.testing.expect(line.line_to.end.point_type.point_type.dash_mode);
    try std.testing.expect(line.line_to.end.point_type.point_type.path_marker);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, line.line_to.figure_start);

    const bezier = try expectNext(&iterator);
    try std.testing.expect(bezier == .bezier_to);
    try std.testing.expectEqual(geometry.PointF{ .x = 26, .y = 48 }, bezier.bezier_to.start);
    try std.testing.expectEqual(geometry.PointF{ .x = 30, .y = 52 }, bezier.bezier_to.control1.value);
    try std.testing.expect(bezier.bezier_to.control1.point_type.point_type.dash_mode);
    try std.testing.expectEqual(geometry.PointF{ .x = 34, .y = 56 }, bezier.bezier_to.control2.value);
    try std.testing.expect(bezier.bezier_to.control2.point_type.point_type.path_marker);
    try std.testing.expectEqual(geometry.PointF{ .x = 38, .y = 60 }, bezier.bezier_to.end.value);
    try std.testing.expect(bezier.bezier_to.end.point_type.point_type.close_subpath);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, bezier.bezier_to.figure_start);
    try std.testing.expectEqual(try cubic_evaluation.evaluate(.{
        .start = bezier.bezier_to.start,
        .control1 = bezier.bezier_to.control1.value,
        .control2 = bezier.bezier_to.control2.value,
        .end = bezier.bezier_to.end.value,
    }, 0.25), try bezier.bezier_to.pointAt(0.25));
    const split = try bezier.bezier_to.splitAt(0.25);
    try std.testing.expectEqual(try bezier.bezier_to.pointAt(0.25), split.left.end);
    try std.testing.expectEqual(split.left.end, split.right.start);

    const closing = try expectNext(&iterator);
    try std.testing.expect(closing == .close_figure);
    try std.testing.expectEqual(geometry.PointF{ .x = 38, .y = 60 }, closing.close_figure.start);
    try std.testing.expectEqual(geometry.PointF{ .x = 22, .y = 44 }, closing.close_figure.end);
    try std.testing.expect((try iterator.next()) == null);

    const relative_points = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
    const rle_types = [_]u8{ 0x41, 0x00, 0x41, 0x83, 0x41, 0x00, 0xc3, 0x01 };
    var rle_iterator = fromSegments(path_segments.segments(path_geometry.commands(
        .{ .reader = .{ .bytes = &relative_points }, .encoding = .relative, .remaining = 6 },
        .{ .reader = .{ .bytes = &rle_types }, .rle = true, .remaining = 6 },
    )), world_page_device.resolve(transform_matrix.TransformMatrix.identity, page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 })).?);
    const rle_line = try expectNext(&rle_iterator);
    try std.testing.expect(rle_line == .line_to);
    try std.testing.expectEqual(path_type.Kind.bezier, rle_line.line_to.end.point_type.point_type.kind);
    try std.testing.expect(rle_line.line_to.end.point_type.rle_bezier != null);
    try std.testing.expectEqual(false, rle_line.line_to.end.point_type.rle_bezier.?);
    try std.testing.expect(rle_line.line_to.end.point_type.point_type.close_subpath);
}

test "EMF+ Path fill device segments preserve implicit closure" {
    var point_bytes = [_]u8{0} ** 8;
    for ([_]i16{ 1, 2, 3, 4 }, 0..) |coordinate, index|
        std.mem.writeInt(i16, point_bytes[index * 2 ..][0..2], coordinate, .little);
    const types = [_]u8{ 0x00, 0x01 };
    const page = page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 });
    var iterator = fromSegments(path_fill_segments.segments(commands(&point_bytes, &types, 2, .integer)), world_page_device.resolve(transform_matrix.TransformMatrix.identity, page).?);
    const line = try expectNext(&iterator);
    try std.testing.expect(line == .line_to);
    const closing = try expectNext(&iterator);
    try std.testing.expect(closing == .close_figure);
    try std.testing.expectEqual(line.line_to.end.value, closing.close_figure.start);
    try std.testing.expectEqual(line.line_to.start, closing.close_figure.end);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path device segments keep source errors atomic" {
    const point_bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const types = [_]u8{ 0x00, 0x03, 0x03, 0x03 };
    const page = page_transform.build(.pixel, 1, .{ .x = 96, .y = 96 });
    var iterator = fromSegments(path_segments.segments(commands(&point_bytes, &types, 4, .relative)), world_page_device.resolve(transform_matrix.TransformMatrix.identity, page).?);
    iterator.source.source.points.source.reader.bytes = point_bytes[0..7];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
}
