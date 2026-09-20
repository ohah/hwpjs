const std = @import("std");
const binary = @import("../../binary/reader.zig");

pub const Rect = struct {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
};

pub const Rects = struct {
    bytes: []const u8,
    count: u16,
    compressed: bool,

    pub fn iterator(self: Rects) Iterator {
        return .{ .reader = .{ .bytes = self.bytes }, .remaining = self.count, .compressed = self.compressed };
    }
};

pub const Iterator = struct {
    reader: binary.Reader,
    remaining: u16,
    compressed: bool,
    previous: Rect = .{ .left = 0, .top = 0, .right = 0, .bottom = 0 },

    pub fn next(self: *Iterator) !?Rect {
        if (self.remaining == 0) return null;
        var pending = self.*;
        const left_delta = try readCoordinate(&pending.reader, pending.compressed);
        const top_delta = try readCoordinate(&pending.reader, pending.compressed);
        const right_delta = try readCoordinate(&pending.reader, pending.compressed);
        const bottom_from_top = try readCoordinate(&pending.reader, pending.compressed);
        const current: Rect = .{
            .left = pending.previous.left + left_delta,
            .top = pending.previous.top + top_delta,
            .right = pending.previous.right + right_delta,
            .bottom = pending.previous.top + top_delta + bottom_from_top,
        };
        pending.previous = current;
        pending.remaining -= 1;
        self.* = pending;
        return current;
    }
};

pub fn parse(bytes: []const u8, count: u16, compressed: bool) !Rects {
    const width: usize = if (compressed) 4 else 8;
    const expected = @as(usize, count) * width;
    if (bytes.len != expected) return error.InvalidEmfPlusSetTSClipRectsSize;
    const result: Rects = .{ .bytes = bytes, .count = count, .compressed = compressed };
    var iterator = result.iterator();
    while (try iterator.next()) |_| {}
    std.debug.assert(iterator.reader.offset == bytes.len);
    return result;
}

fn readCoordinate(reader: *binary.Reader, compressed: bool) !i32 {
    var pending = reader.*;
    const first = try pending.readInt(u8);
    const value: i32 = if (compressed) blk: {
        if (first & 0x80 == 0) return error.InvalidEmfPlusSetTSClipCoordinate;
        const raw: u7 = @truncate(first);
        break :blk signExtend(raw, 7);
    } else blk: {
        if (first & 0x80 != 0) return error.InvalidEmfPlusSetTSClipCoordinate;
        const second = try pending.readInt(u8);
        const raw: u15 = (@as(u15, @truncate(first)) << 8) | second;
        break :blk signExtend(raw, 15);
    };
    reader.* = pending;
    return value;
}

fn signExtend(value: anytype, comptime bits: comptime_int) i32 {
    const unsigned: u32 = value;
    const sign = @as(u32, 1) << (bits - 1);
    return @bitCast((unsigned ^ sign) -% sign);
}

test "EMF+ SetTSClip decodes compressed delta rectangles and bottom from current top" {
    const bytes = [_]u8{
        0x81, 0xfe, 0xbf, 0x85, // +1, -2, +63, +5
        0xc0, 0xff, 0x82, 0x80, // -64, -1, +2, 0
    };
    const rects = try parse(&bytes, 2, true);
    var iterator = rects.iterator();
    try std.testing.expectEqual(Rect{ .left = 1, .top = -2, .right = 63, .bottom = 3 }, (try iterator.next()).?);
    try std.testing.expectEqual(Rect{ .left = -63, .top = -3, .right = 65, .bottom = -3 }, (try iterator.next()).?);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ SetTSClip decodes wide big-endian signed 15-bit deltas" {
    const bytes = [_]u8{
        0x40, 0x00, // -16384
        0x7f, 0xff, // -1
        0x00, 0x00, // 0
        0x3f, 0xff, // 16383
    };
    var iterator = (try parse(&bytes, 1, false)).iterator();
    try std.testing.expectEqual(Rect{ .left = -16384, .top = -1, .right = 0, .bottom = 16382 }, (try iterator.next()).?);
}

test "EMF+ SetTSClip coordinate decoders cover every signed wire value" {
    var compressed_raw: u16 = 0;
    while (compressed_raw < 0x80) : (compressed_raw += 1) {
        const bytes = [_]u8{0x80 | @as(u8, @intCast(compressed_raw))};
        var reader: binary.Reader = .{ .bytes = &bytes };
        const expected: i32 = if (compressed_raw < 0x40) @intCast(compressed_raw) else @as(i32, @intCast(compressed_raw)) - 0x80;
        try std.testing.expectEqual(expected, try readCoordinate(&reader, true));
        try std.testing.expectEqual(@as(usize, 1), reader.offset);
    }

    var wide_raw: u32 = 0;
    while (wide_raw < 0x8000) : (wide_raw += 1) {
        const bytes = [_]u8{ @intCast(wide_raw >> 8), @truncate(wide_raw) };
        var reader: binary.Reader = .{ .bytes = &bytes };
        const expected: i32 = if (wide_raw < 0x4000) @intCast(wide_raw) else @as(i32, @intCast(wide_raw)) - 0x8000;
        try std.testing.expectEqual(expected, try readCoordinate(&reader, false));
        try std.testing.expectEqual(@as(usize, 2), reader.offset);
    }
}

test "EMF+ SetTSClip validates coordinate markers sizes and iterator atomicity" {
    try std.testing.expect((try parse(&.{}, 0, false)).iterator().remaining == 0);
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipRectsSize, parse(&.{ 0x80, 0x80, 0x80 }, 1, true));
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipRectsSize, parse(&([_]u8{0} ** 7), 1, false));
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipCoordinate, parse(&.{ 0, 0x80, 0x80, 0x80 }, 1, true));
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipCoordinate, parse(&.{ 0x80, 0, 0, 0, 0, 0, 0, 0 }, 1, false));

    const bytes = [_]u8{ 0x81, 0x82, 0x83, 0x84 };
    var iterator = (try parse(&bytes, 1, true)).iterator();
    iterator.reader.bytes = bytes[0..3];
    try std.testing.expectError(error.UnexpectedEnd, iterator.next());
    try std.testing.expectEqual(@as(usize, 0), iterator.reader.offset);
    try std.testing.expectEqual(@as(u16, 1), iterator.remaining);

    const wide_bytes = [_]u8{0} ** 8;
    var wide_iterator = (try parse(&wide_bytes, 1, false)).iterator();
    wide_iterator.reader.bytes = wide_bytes[0..7];
    try std.testing.expectError(error.UnexpectedEnd, wide_iterator.next());
    try std.testing.expectEqual(@as(usize, 0), wide_iterator.reader.offset);
    try std.testing.expectEqual(@as(u16, 1), wide_iterator.remaining);
}
