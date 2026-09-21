const point_data = @import("emf_plus_point_data.zig");
const resolved = @import("emf_plus_resolved_point_data.zig");

pub const Segment = struct {
    start: resolved.Value,
    control1: resolved.Value,
    control2: resolved.Value,
    end: resolved.Value,
};

pub const Iterator = struct {
    source: resolved.Iterator,
    previous_end: ?resolved.Value = null,

    pub fn next(self: *Iterator) !?Segment {
        if (self.source.source.remaining == 0) return null;
        var pending = self.*;
        const start = pending.previous_end orelse (try pending.source.next()).?;
        const control1 = (try pending.source.next()).?;
        const control2 = (try pending.source.next()).?;
        const end = (try pending.source.next()).?;
        pending.previous_end = end;
        self.* = pending;
        return .{ .start = start, .control1 = control1, .control2 = control2, .end = end };
    }
};

pub fn segments(source: point_data.PointData) !Iterator {
    if (source.count < 4 or (source.count - 1) % 3 != 0)
        return error.InvalidEmfPlusBezierTopology;
    return .{ .source = resolved.points(source) };
}

const std = @import("std");

fn expectInteger(expected: resolved.IntegerPoint, actual: resolved.Value) !void {
    try std.testing.expectEqual(expected, actual.integer);
}

test "EMF+ Bezier segments resolve connected PointR groups without duplicating endpoints" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 };
    var iterator = try segments(try point_data.parse(&bytes, 7, true, false, .{}));
    const maybe_first = try iterator.next();
    try std.testing.expect(maybe_first != null);
    const first = maybe_first.?;
    try expectInteger(.{ .x = 1, .y = 2 }, first.start);
    try expectInteger(.{ .x = 4, .y = 6 }, first.control1);
    try expectInteger(.{ .x = 9, .y = 12 }, first.control2);
    try expectInteger(.{ .x = 16, .y = 20 }, first.end);
    const maybe_second = try iterator.next();
    try std.testing.expect(maybe_second != null);
    const second = maybe_second.?;
    try expectInteger(.{ .x = 16, .y = 20 }, second.start);
    try expectInteger(.{ .x = 25, .y = 30 }, second.control1);
    try expectInteger(.{ .x = 36, .y = 42 }, second.control2);
    try expectInteger(.{ .x = 49, .y = 56 }, second.end);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Bezier segments preserve absolute integer and floating point representations" {
    var integers = [_]u8{0} ** 16;
    const coordinates = [_]i16{ -32_768, 32_767, -3, 4, -5, 6, -7, 8 };
    for (coordinates, 0..) |value, index| std.mem.writeInt(i16, integers[index * 2 ..][0..2], value, .little);
    var integer_iterator = try segments(try point_data.parse(&integers, 4, false, true, .{}));
    const maybe_integer = try integer_iterator.next();
    try std.testing.expect(maybe_integer != null);
    const integer = maybe_integer.?;
    try expectInteger(.{ .x = -32_768, .y = 32_767 }, integer.start);
    try expectInteger(.{ .x = -7, .y = 8 }, integer.end);

    var floats = [_]u8{0} ** 32;
    const bits = [_]u32{ 0x80000000, 0x7fc00001, 1, 2, 3, 4, 0x7f800000, 0xff800000 };
    for (bits, 0..) |value, index| std.mem.writeInt(u32, floats[index * 4 ..][0..4], value, .little);
    var floating_iterator = try segments(try point_data.parse(&floats, 4, false, false, .{}));
    const maybe_floating = try floating_iterator.next();
    try std.testing.expect(maybe_floating != null);
    const floating = maybe_floating.?;
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(floating.start.floating.x)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(floating.start.floating.y)));
    try std.testing.expect(std.math.isPositiveInf(floating.end.floating.x));
    try std.testing.expect(std.math.isNegativeInf(floating.end.floating.y));
}

test "EMF+ Bezier segments separate wire count acceptance from complete topology" {
    const bytes = [_]u8{0} ** 24;
    for ([_]u32{ 0, 1, 2, 3, 5, 6 }) |count| {
        const source = try point_data.parse(bytes[0 .. count * 4], count, false, true, .{});
        try std.testing.expectError(error.InvalidEmfPlusBezierTopology, segments(source));
    }
    _ = try segments(try point_data.parse(bytes[0..16], 4, false, true, .{}));
}

test "EMF+ Bezier segment iterator rolls back an incomplete borrowed group" {
    const bytes = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const source = try point_data.parse(&bytes, 4, true, false, .{});
    var iterator = try segments(source);
    iterator.source.source.reader.bytes = bytes[0..7];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqual(before.source.source.reader.offset, iterator.source.source.reader.offset);
    try std.testing.expectEqual(before.source.source.remaining, iterator.source.source.remaining);
    try std.testing.expectEqual(before.source.previous_relative, iterator.source.previous_relative);
    try std.testing.expectEqual(before.previous_end, iterator.previous_end);
}
