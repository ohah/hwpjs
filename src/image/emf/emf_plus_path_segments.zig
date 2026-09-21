const geometry = @import("emf_plus_path_geometry.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");

pub const ClosingLine = struct {
    start: resolved.Value,
    end: resolved.Value,
};

pub const Segment = union(enum) {
    line_to: geometry.Line,
    bezier_to: geometry.Bezier,
    close_figure: ClosingLine,
};

pub const Iterator = struct {
    source: geometry.Iterator,
    pending_close: ?ClosingLine = null,

    pub fn next(self: *Iterator) !?Segment {
        var pending = self.*;
        if (pending.pending_close) |closing| {
            pending.pending_close = null;
            self.* = pending;
            return .{ .close_figure = closing };
        }

        while (try pending.source.next()) |command| switch (command) {
            .move_to => {},
            .line_to => |line| {
                if (line.end.point_type.point_type.close_subpath) {
                    pending.pending_close = .{
                        .start = line.end.value,
                        .end = line.figure_start,
                    };
                }
                self.* = pending;
                return .{ .line_to = line };
            },
            .bezier_to => |bezier| {
                if (bezier.end.point_type.point_type.close_subpath) {
                    pending.pending_close = .{
                        .start = bezier.end.value,
                        .end = bezier.figure_start,
                    };
                }
                self.* = pending;
                return .{ .bezier_to = bezier };
            },
        };

        self.* = pending;
        return null;
    }
};

pub fn segments(source: geometry.Iterator) Iterator {
    return .{ .source = source };
}

const path_type = @import("emf_plus_path_type.zig");
const point = @import("emf_plus_point.zig");
const std = @import("std");

fn commands(point_bytes: []const u8, type_bytes: []const u8, count: u32, encoding: point.Encoding) geometry.Iterator {
    return geometry.commands(
        .{ .reader = .{ .bytes = point_bytes }, .encoding = encoding, .remaining = count },
        .{ .reader = .{ .bytes = type_bytes }, .rle = false, .remaining = count },
    );
}

fn expectSegment(iterator: *Iterator) !Segment {
    const value = try iterator.next();
    try std.testing.expect(value != null);
    return value.?;
}

test "EMF+ Path segments materialize line and Bezier figure closure in order" {
    var point_bytes = [_]u8{0} ** (11 * 4);
    for (0..11) |index| {
        std.mem.writeInt(i16, point_bytes[index * 4 ..][0..2], @intCast(index * 2), .little);
        std.mem.writeInt(i16, point_bytes[index * 4 + 2 ..][0..2], @intCast(index * 2 + 1), .little);
    }
    const types = [_]u8{ 0x00, 0x01, 0x81, 0x00, 0x03, 0x03, 0x83, 0x80, 0x00, 0x01, 0x00 };
    var iterator = segments(commands(&point_bytes, &types, 11, .integer));

    const line = try expectSegment(&iterator);
    try std.testing.expect(line == .line_to);
    try std.testing.expectEqual(@as(i64, 0), line.line_to.start.integer.x);
    try std.testing.expectEqual(@as(i64, 2), line.line_to.end.value.integer.x);
    const closing_line = try expectSegment(&iterator);
    try std.testing.expect(closing_line == .line_to);
    try std.testing.expectEqual(@as(i64, 2), closing_line.line_to.start.integer.x);
    try std.testing.expectEqual(@as(i64, 4), closing_line.line_to.end.value.integer.x);
    const line_close = try expectSegment(&iterator);
    try std.testing.expect(line_close == .close_figure);
    try std.testing.expectEqual(@as(i64, 4), line_close.close_figure.start.integer.x);
    try std.testing.expectEqual(@as(i64, 0), line_close.close_figure.end.integer.x);

    const bezier = try expectSegment(&iterator);
    try std.testing.expect(bezier == .bezier_to);
    try std.testing.expectEqual(@as(i64, 8), bezier.bezier_to.control1.value.integer.x);
    try std.testing.expectEqual(@as(i64, 12), bezier.bezier_to.end.value.integer.x);
    const bezier_close = try expectSegment(&iterator);
    try std.testing.expect(bezier_close == .close_figure);
    try std.testing.expectEqual(@as(i64, 12), bezier_close.close_figure.start.integer.x);
    try std.testing.expectEqual(@as(i64, 6), bezier_close.close_figure.end.integer.x);

    const open_line = try expectSegment(&iterator);
    try std.testing.expect(open_line == .line_to);
    try std.testing.expectEqual(@as(i64, 16), open_line.line_to.start.integer.x);
    try std.testing.expectEqual(@as(i64, 18), open_line.line_to.end.value.integer.x);
    try std.testing.expect((try iterator.next()) == null);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path segments preserve an explicit degenerate closing line" {
    var point_bytes = [_]u8{0} ** 16;
    const bits = [_]u32{ 0x80000000, 0x7fc00001, 0x80000000, 0x7fc00001 };
    for (bits, 0..) |value, index| std.mem.writeInt(u32, point_bytes[index * 4 ..][0..4], value, .little);
    const types = [_]u8{ 0x00, 0x81 };
    var iterator = segments(commands(&point_bytes, &types, 2, .floating));
    const line = try expectSegment(&iterator);
    try std.testing.expect(line == .line_to);
    const closing = try expectSegment(&iterator);
    try std.testing.expect(closing == .close_figure);
    for ([_]resolved.Value{ closing.close_figure.start, closing.close_figure.end }) |value| {
        try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(value.floating.x)));
        try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(value.floating.y)));
    }
    try std.testing.expect((try iterator.next()) == null);

    var integer_bytes = [_]u8{0} ** 8;
    for ([_]i16{ 7, -8, 7, -8 }, 0..) |value, index| {
        std.mem.writeInt(i16, integer_bytes[index * 2 ..][0..2], value, .little);
    }
    var integer_iterator = segments(commands(&integer_bytes, &types, 2, .integer));
    const integer_line = try expectSegment(&integer_iterator);
    try std.testing.expect(integer_line == .line_to);
    const integer_closing = try expectSegment(&integer_iterator);
    try std.testing.expect(integer_closing == .close_figure);
    try std.testing.expectEqual(integer_closing.close_figure.start.integer, integer_closing.close_figure.end.integer);
    try std.testing.expect((try integer_iterator.next()) == null);
}

test "EMF+ Path segments roll back skipped moves and incomplete source commands" {
    const point_bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const types = [_]u8{ 0x00, 0x03, 0x03, 0x03 };
    var iterator = segments(commands(&point_bytes, &types, 4, .relative));
    iterator.source.points.source.reader.bytes = point_bytes[0..7];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqual(before.source.points.source.reader.offset, iterator.source.points.source.reader.offset);
    try std.testing.expectEqual(before.source.points.source.remaining, iterator.source.points.source.remaining);
    try std.testing.expectEqual(before.source.points.previous_relative, iterator.source.points.previous_relative);
    try std.testing.expectEqual(before.source.types.reader.offset, iterator.source.types.reader.offset);
    try std.testing.expectEqual(before.source.types.remaining, iterator.source.types.remaining);
    try std.testing.expectEqual(before.source.current, iterator.source.current);
    try std.testing.expectEqual(before.source.figure_start, iterator.source.figure_start);
    try std.testing.expectEqual(before.source.needs_start, iterator.source.needs_start);
    try std.testing.expectEqual(before.pending_close, iterator.pending_close);
}
