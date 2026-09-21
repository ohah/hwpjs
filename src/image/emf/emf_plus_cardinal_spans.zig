const point_data = @import("emf_plus_point_data.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");

pub const Span = struct {
    start: resolved.Value,
    end: resolved.Value,
};

pub const Iterator = struct {
    source: resolved.Iterator,
    skip: u32,
    remaining_spans: u32,
    closed: bool,
    first: ?resolved.Value = null,
    previous: ?resolved.Value = null,

    pub fn next(self: *Iterator) !?Span {
        if (self.remaining_spans == 0) return null;
        var pending = self.*;
        if (pending.previous == null) {
            while (pending.skip != 0) : (pending.skip -= 1)
                _ = try pending.source.next() orelse return error.InvalidEmfPlusCardinalPointData;
            const first = try pending.source.next() orelse return error.InvalidEmfPlusCardinalPointData;
            pending.first = first;
            pending.previous = first;
        }

        if (try pending.source.next()) |current| {
            const result: Span = .{ .start = pending.previous.?, .end = current };
            pending.previous = current;
            pending.remaining_spans -= 1;
            self.* = pending;
            return result;
        }
        if (!pending.closed or pending.remaining_spans != 1)
            return error.InvalidEmfPlusCardinalPointData;

        const result: Span = .{ .start = pending.previous.?, .end = pending.first.? };
        pending.remaining_spans = 0;
        self.* = pending;
        return result;
    }
};

pub fn open(source: point_data.PointData, offset: u32, num_segments: u32) !Iterator {
    if (offset >= source.count or num_segments > source.count - offset - 1)
        return error.InvalidEmfPlusCardinalRange;
    return .{
        .source = resolved.points(source),
        .skip = offset,
        .remaining_spans = num_segments,
        .closed = false,
    };
}

pub fn closed(source: point_data.PointData) !Iterator {
    if (source.count < 3) return error.InvalidEmfPlusCardinalPointCount;
    return .{
        .source = resolved.points(source),
        .skip = 0,
        .remaining_spans = source.count,
        .closed = true,
    };
}

const std = @import("std");

fn expectInteger(expected_start: resolved.IntegerPoint, expected_end: resolved.IntegerPoint, actual: Span) !void {
    try std.testing.expectEqual(expected_start, actual.start.integer);
    try std.testing.expectEqual(expected_end, actual.end.integer);
}

fn expectNext(iterator: *Iterator) !Span {
    const value = try iterator.next();
    try std.testing.expect(value != null);
    return value.?;
}

test "EMF+ open cardinal spans apply offset and segment count after PointR resolution" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const source = try point_data.parse(&bytes, 4, true, false, .{});
    var iterator = try open(source, 1, 2);
    try expectInteger(.{ .x = 4, .y = 6 }, .{ .x = 9, .y = 12 }, try expectNext(&iterator));
    try expectInteger(.{ .x = 9, .y = 12 }, .{ .x = 16, .y = 20 }, try expectNext(&iterator));
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ open cardinal spans reject out of range selection and preserve empty selection" {
    const bytes = [_]u8{0} ** 16;
    const source = try point_data.parse(&bytes, 4, false, true, .{});
    try std.testing.expectError(error.InvalidEmfPlusCardinalRange, open(source, 4, 0));
    try std.testing.expectError(error.InvalidEmfPlusCardinalRange, open(source, 3, 1));
    try std.testing.expectError(error.InvalidEmfPlusCardinalRange, open(source, 1, 3));
    var empty = try open(source, 3, 0);
    try std.testing.expect((try empty.next()) == null);
    try std.testing.expectEqual(@as(usize, 0), empty.source.source.reader.offset);
}

test "EMF+ closed cardinal spans include the last to first span and preserve float bits" {
    var bytes = [_]u8{0} ** 24;
    const bits = [_]u32{ 0x80000000, 0x7fc00001, 1, 2, 0x7f800000, 0xff800000 };
    for (bits, 0..) |value, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], value, .little);
    const source = try point_data.parse(&bytes, 3, false, false, .{});
    var iterator = try closed(source);
    const first = try expectNext(&iterator);
    _ = try expectNext(&iterator);
    const closing = try expectNext(&iterator);
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(first.start.floating.x)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(first.start.floating.y)));
    try std.testing.expect(std.math.isPositiveInf(closing.start.floating.x));
    try std.testing.expect(std.math.isNegativeInf(closing.start.floating.y));
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(closing.end.floating.x)));
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ cardinal span constructors and iterator failures are atomic" {
    const too_few = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfPlusCardinalPointCount, closed(try point_data.parse(&too_few, 2, false, true, .{})));

    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6 };
    const source = try point_data.parse(&bytes, 3, true, false, .{});
    var iterator = try open(source, 1, 1);
    iterator.source.source.reader.bytes = bytes[0..5];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqual(before.source.source.reader.offset, iterator.source.source.reader.offset);
    try std.testing.expectEqual(before.source.source.remaining, iterator.source.source.remaining);
    try std.testing.expectEqual(before.source.previous_relative, iterator.source.previous_relative);
    try std.testing.expectEqual(before.skip, iterator.skip);
    try std.testing.expectEqual(before.remaining_spans, iterator.remaining_spans);
    try std.testing.expectEqual(before.first, iterator.first);
    try std.testing.expectEqual(before.previous, iterator.previous);
}
