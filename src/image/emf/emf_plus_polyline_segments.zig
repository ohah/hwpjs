const point_data = @import("emf_plus_point_data.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");

pub const Segment = struct {
    start: resolved.Value,
    end: resolved.Value,
};

pub const Closing = enum { none, always, if_distinct };

fn samePosition(a: resolved.Value, b: resolved.Value) bool {
    return switch (a) {
        .integer => |left| switch (b) {
            .integer => |right| left.x == right.x and left.y == right.y,
            .floating => false,
        },
        .floating => |left| switch (b) {
            .integer => false,
            .floating => |right| left.x == right.x and left.y == right.y,
        },
    };
}

pub const Iterator = struct {
    source: resolved.Iterator,
    closing: Closing,
    first: ?resolved.Value = null,
    previous: ?resolved.Value = null,
    segments_emitted: u32 = 0,
    done: bool = false,

    pub fn next(self: *Iterator) !?Segment {
        if (self.done) return null;
        var pending = self.*;
        if (pending.previous == null) {
            const first = try pending.source.next() orelse {
                pending.done = true;
                self.* = pending;
                return null;
            };
            pending.first = first;
            pending.previous = first;
        }

        if (try pending.source.next()) |current| {
            const result: Segment = .{ .start = pending.previous.?, .end = current };
            pending.previous = current;
            pending.segments_emitted += 1;
            self.* = pending;
            return result;
        }

        if (pending.segments_emitted != 0 and
            (pending.closing == .always or
                (pending.closing == .if_distinct and !samePosition(pending.previous.?, pending.first.?))))
        {
            const result: Segment = .{ .start = pending.previous.?, .end = pending.first.? };
            pending.done = true;
            self.* = pending;
            return result;
        }

        pending.done = true;
        self.* = pending;
        return null;
    }
};

pub fn segments(source: point_data.PointData, close: bool) Iterator {
    return .{ .source = resolved.points(source), .closing = if (close) .always else .none };
}

pub fn polygonBoundary(source: point_data.PointData) Iterator {
    return .{ .source = resolved.points(source), .closing = .if_distinct };
}

const std = @import("std");

fn expectIntegerSegment(expected_start: resolved.IntegerPoint, expected_end: resolved.IntegerPoint, actual: Segment) !void {
    try std.testing.expectEqual(expected_start, actual.start.integer);
    try std.testing.expectEqual(expected_end, actual.end.integer);
}

test "EMF+ polyline segments resolve relative points and honor optional closure" {
    const bytes = [_]u8{ 1, 2, 3, 4, 0x7f, 0x40 };
    const source = try point_data.parse(&bytes, 3, true, false, .{});

    var open = segments(source, false);
    try expectIntegerSegment(.{ .x = 1, .y = 2 }, .{ .x = 4, .y = 6 }, (try open.next()).?);
    try expectIntegerSegment(.{ .x = 4, .y = 6 }, .{ .x = 3, .y = -58 }, (try open.next()).?);
    try std.testing.expect((try open.next()) == null);

    var closed = segments(source, true);
    try expectIntegerSegment(.{ .x = 1, .y = 2 }, .{ .x = 4, .y = 6 }, (try closed.next()).?);
    try expectIntegerSegment(.{ .x = 4, .y = 6 }, .{ .x = 3, .y = -58 }, (try closed.next()).?);
    try expectIntegerSegment(.{ .x = 3, .y = -58 }, .{ .x = 1, .y = 2 }, (try closed.next()).?);
    try std.testing.expect((try closed.next()) == null);
}

test "EMF+ polyline segments preserve floating point bits and explicit degenerate closure" {
    var bytes = [_]u8{0} ** 16;
    const bits = [_]u32{ 0x80000000, 0x7fc00001, 0x80000000, 0x7fc00001 };
    for (bits, 0..) |value, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], value, .little);
    var iterator = segments(try point_data.parse(&bytes, 2, false, false, .{}), true);
    const forward = (try iterator.next()).?;
    const closing = (try iterator.next()).?;
    for ([_]resolved.Value{ forward.start, forward.end, closing.start, closing.end }) |value| {
        try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(value.floating.x)));
        try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(value.floating.y)));
    }
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ polygon boundary omits coincident closing side without changing DrawLines closure" {
    const integers = [_]u8{ 1, 0, 2, 0, 3, 0, 4, 0, 1, 0, 2, 0 };
    const source = try point_data.parse(&integers, 3, false, true, .{});
    var polygon = polygonBoundary(source);
    _ = (try polygon.next()).?;
    _ = (try polygon.next()).?;
    try std.testing.expect((try polygon.next()) == null);
    try std.testing.expect((try polygon.next()) == null);

    var lines = segments(source, true);
    _ = (try lines.next()).?;
    _ = (try lines.next()).?;
    const closing = (try lines.next()).?;
    try std.testing.expectEqual(resolved.IntegerPoint{ .x = 1, .y = 2 }, closing.start.integer);
    try std.testing.expectEqual(closing.start.integer, closing.end.integer);

    var floats = [_]u8{0} ** 24;
    for ([_]u32{ 0x80000000, 0, 0x3f800000, 0, 0, 0x80000000 }, 0..) |bits, index|
        std.mem.writeInt(u32, floats[index * 4 ..][0..4], bits, .little);
    var signed_zero = polygonBoundary(try point_data.parse(&floats, 3, false, false, .{}));
    _ = (try signed_zero.next()).?;
    _ = (try signed_zero.next()).?;
    try std.testing.expect((try signed_zero.next()) == null);
}

test "EMF+ polyline segments require two points and fail atomically" {
    const one = [_]u8{ 1, 2 };
    var singleton = segments(try point_data.parse(&one, 1, true, false, .{}), true);
    try std.testing.expect((try singleton.next()) == null);
    try std.testing.expect(singleton.done);
    try std.testing.expectEqual(@as(u32, 0), singleton.segments_emitted);

    const two = [_]u8{ 1, 2, 3, 4 };
    const source = try point_data.parse(&two, 2, true, false, .{});
    var truncated = segments(source, false);
    truncated.source.source.reader.bytes = two[0..3];
    const before = truncated;
    try std.testing.expectError(error.UnexpectedEnd, truncated.next());
    try std.testing.expectEqual(before.source.source.reader.offset, truncated.source.source.reader.offset);
    try std.testing.expectEqual(before.source.source.remaining, truncated.source.source.remaining);
    try std.testing.expectEqual(before.source.previous_relative, truncated.source.previous_relative);
    try std.testing.expectEqual(before.first, truncated.first);
    try std.testing.expectEqual(before.previous, truncated.previous);
    try std.testing.expectEqual(before.segments_emitted, truncated.segments_emitted);
    try std.testing.expectEqual(before.done, truncated.done);
}
