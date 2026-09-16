const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const integer = @import("emf_plus_integer.zig");

pub const Point = geometry.Point;
pub const PointR = struct { x: i16, y: i16, encoded_bytes: u3 };

pub const readPoint = geometry.readPoint;

pub fn readPointR(reader: *binary.Reader) !PointR {
    var next = reader.*;
    const x = try integer.read(&next);
    const y = try integer.read(&next);
    const result: PointR = .{
        .x = x.value,
        .y = y.value,
        .encoded_bytes = @as(u3, x.width) + @as(u3, y.width),
    };
    reader.* = next;
    return result;
}

pub const Encoding = enum { floating, integer, relative };
pub const Value = union(Encoding) {
    floating: geometry.PointF,
    integer: Point,
    relative: PointR,
};

pub const Iterator = struct {
    reader: binary.Reader,
    encoding: Encoding,
    remaining: u32,

    pub fn next(self: *Iterator) !?Value {
        if (self.remaining == 0) return null;
        var reader = self.reader;
        const value: Value = switch (self.encoding) {
            .floating => .{ .floating = try geometry.readPointF(&reader) },
            .integer => .{ .integer = try readPoint(&reader) },
            .relative => .{ .relative = try readPointR(&reader) },
        };
        self.reader = reader;
        self.remaining -= 1;
        return value;
    }
};

test "EMF+ absolute and mixed-width relative points preserve wire values" {
    const std = @import("std");
    var absolute_reader: binary.Reader = .{ .bytes = &.{ 0x00, 0x80, 0xff, 0x7f } };
    const absolute = try readPoint(&absolute_reader);
    try std.testing.expectEqual(@as(i16, -32_768), absolute.x);
    try std.testing.expectEqual(@as(i16, 32_767), absolute.y);

    var relative_reader: binary.Reader = .{ .bytes = &.{ 0x3f, 0xff, 0xc0 } };
    const relative = try readPointR(&relative_reader);
    try std.testing.expectEqual(@as(i16, 63), relative.x);
    try std.testing.expectEqual(@as(i16, -64), relative.y);
    try std.testing.expectEqual(@as(u3, 3), relative.encoded_bytes);
}

test "EMF+ point readers are atomic at every truncation" {
    const std = @import("std");
    const fixed = [_]u8{0} ** 4;
    for (0..4) |cut| {
        var reader: binary.Reader = .{ .bytes = fixed[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, readPoint(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
    const relative = [_]u8{ 0x80, 0, 0x80, 0 };
    for (0..4) |cut| {
        var reader: binary.Reader = .{ .bytes = relative[0..cut] };
        try std.testing.expectError(error.UnexpectedEnd, readPointR(&reader));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
}
