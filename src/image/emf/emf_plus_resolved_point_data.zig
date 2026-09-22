const point = @import("emf_plus_point.zig");
const point_data = @import("emf_plus_point_data.zig");
const geometry = @import("emf_plus_geometry.zig");

pub const IntegerPoint = struct {
    x: i64,
    y: i64,
};

pub const Value = union(enum) {
    floating: geometry.PointF,
    integer: IntegerPoint,
};

pub fn toPointF(value: Value) geometry.PointF {
    return switch (value) {
        .floating => |point_value| point_value,
        .integer => |point_value| .{
            .x = @floatFromInt(point_value.x),
            .y = @floatFromInt(point_value.y),
        },
    };
}

pub const Iterator = struct {
    source: point.Iterator,
    previous_relative: IntegerPoint = .{ .x = 0, .y = 0 },

    pub fn next(self: *Iterator) !?Value {
        var pending = self.*;
        const raw = try pending.source.next() orelse return null;
        const value: Value = switch (raw) {
            .floating => |value| .{ .floating = value },
            .integer => |value| .{ .integer = .{ .x = value.x, .y = value.y } },
            .relative => |delta| relative: {
                const resolved: IntegerPoint = .{
                    .x = pending.previous_relative.x + @as(i64, delta.x),
                    .y = pending.previous_relative.y + @as(i64, delta.y),
                };
                pending.previous_relative = resolved;
                break :relative .{ .integer = resolved };
            },
        };
        self.* = pending;
        return value;
    }
};

pub fn points(source: point_data.PointData) Iterator {
    return fromIterator(source.points());
}

pub fn fromIterator(source: point.Iterator) Iterator {
    return .{ .source = source };
}

const std = @import("std");

test "EMF+ resolved PointData accumulates PointR from origin without narrowing" {
    const bytes = [_]u8{
        0xbf, 0xff,
        0xc0, 0x00,
        0xbf, 0xff,
        0xc0, 0x00,
        0x3f, 0x40,
    };
    const source = try point_data.parse(&bytes, 3, true, false, .{});
    var iterator = points(source);
    try std.testing.expectEqual(IntegerPoint{ .x = 16_383, .y = -16_384 }, (try iterator.next()).?.integer);
    try std.testing.expectEqual(IntegerPoint{ .x = 32_766, .y = -32_768 }, (try iterator.next()).?.integer);
    try std.testing.expectEqual(IntegerPoint{ .x = 32_829, .y = -32_832 }, (try iterator.next()).?.integer);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ resolved PointData preserves absolute integer and floating representations" {
    var integers = [_]u8{0} ** 8;
    std.mem.writeInt(i16, integers[0..2], -32_768, .little);
    std.mem.writeInt(i16, integers[2..4], 32_767, .little);
    std.mem.writeInt(i16, integers[4..6], 7, .little);
    std.mem.writeInt(i16, integers[6..8], -9, .little);
    var integer_iterator = points(try point_data.parse(&integers, 2, false, true, .{}));
    try std.testing.expectEqual(IntegerPoint{ .x = -32_768, .y = 32_767 }, (try integer_iterator.next()).?.integer);
    try std.testing.expectEqual(IntegerPoint{ .x = 7, .y = -9 }, (try integer_iterator.next()).?.integer);

    var floats = [_]u8{0} ** 8;
    std.mem.writeInt(u32, floats[0..4], @bitCast(@as(f32, -0.0)), .little);
    std.mem.writeInt(u32, floats[4..8], @bitCast(std.math.nan(f32)), .little);
    var floating_iterator = points(try point_data.parse(&floats, 1, false, false, .{}));
    const floating = (try floating_iterator.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(floating.x)));
    try std.testing.expect(std.math.isNan(floating.y));
}

test "EMF+ resolved PointData iterator is atomic when borrowed bytes become truncated" {
    const bytes = [_]u8{ 1, 2, 3, 4 };
    const source = try point_data.parse(&bytes, 2, true, false, .{});
    var iterator = points(source);
    try std.testing.expectEqual(IntegerPoint{ .x = 1, .y = 2 }, (try iterator.next()).?.integer);
    iterator.source.reader.bytes = bytes[0..3];
    const before = iterator;
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqual(before.source.reader.offset, iterator.source.reader.offset);
    try std.testing.expectEqual(before.source.remaining, iterator.source.remaining);
    try std.testing.expectEqual(before.previous_relative, iterator.previous_relative);
}

test "EMF+ resolved PointData owns integer conversion and floating bit preservation" {
    const integer = toPointF(.{ .integer = .{ .x = 16_777_217, .y = -16_777_217 } });
    try std.testing.expectEqual(@as(f32, 16_777_216), integer.x);
    try std.testing.expectEqual(@as(f32, -16_777_216), integer.y);

    const floating = toPointF(.{ .floating = .{
        .x = @bitCast(@as(u32, 0x80000000)),
        .y = @bitCast(@as(u32, 0x7fc00001)),
    } });
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(floating.x)));
    try std.testing.expectEqual(@as(u32, 0x7fc00001), @as(u32, @bitCast(floating.y)));
}
