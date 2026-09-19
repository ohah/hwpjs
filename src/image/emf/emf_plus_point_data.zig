const binary = @import("../../binary/reader.zig");
const point = @import("emf_plus_point.zig");

pub const Options = struct {
    max_points: u32 = 16 * 1024 * 1024,
};

pub const PointData = struct {
    count: u32,
    encoding: point.Encoding,
    bytes: []const u8,
    alignment_padding: []const u8,

    pub fn points(self: PointData) point.Iterator {
        return .{
            .reader = .{ .bytes = self.bytes },
            .encoding = self.encoding,
            .remaining = self.count,
        };
    }
};

pub fn parse(bytes: []const u8, count: u32, relative: bool, compressed: bool, options: Options) !PointData {
    if (count > options.max_points) return error.LimitExceeded;
    const encoding: point.Encoding = if (relative) .relative else if (compressed) .integer else .floating;
    if (encoding != .relative) {
        const width: usize = if (encoding == .integer) 4 else 8;
        const expected = std.math.mul(usize, @as(usize, count), width) catch return error.LimitExceeded;
        if (bytes.len != expected) return error.InvalidEmfPlusPointDataSize;
        return .{
            .count = count,
            .encoding = encoding,
            .bytes = bytes,
            .alignment_padding = bytes[bytes.len..],
        };
    }

    var iterator: point.Iterator = .{
        .reader = .{ .bytes = bytes },
        .encoding = .relative,
        .remaining = count,
    };
    while (try iterator.next()) |_| {}
    const padding = bytes[iterator.reader.offset..];
    if (padding.len > 3) return error.InvalidEmfPlusPointDataPadding;
    return .{
        .count = count,
        .encoding = .relative,
        .bytes = bytes[0..iterator.reader.offset],
        .alignment_padding = padding,
    };
}

const std = @import("std");

test "EMF+ PointData preserves all three encodings and ignores C for relative points" {
    var integers = [_]u8{0} ** 8;
    std.mem.writeInt(i16, integers[0..2], -32768, .little);
    std.mem.writeInt(i16, integers[2..4], 32767, .little);
    std.mem.writeInt(i16, integers[4..6], -1, .little);
    std.mem.writeInt(i16, integers[6..8], 2, .little);
    const integer = try parse(&integers, 2, false, true, .{});
    try std.testing.expectEqual(point.Encoding.integer, integer.encoding);
    var integer_points = integer.points();
    try std.testing.expectEqual(@as(i16, -32768), (try integer_points.next()).?.integer.x);
    try std.testing.expectEqual(@as(i16, 2), (try integer_points.next()).?.integer.y);

    var floats = [_]u8{0} ** 8;
    std.mem.writeInt(u32, floats[0..4], @bitCast(@as(f32, -0.0)), .little);
    std.mem.writeInt(u32, floats[4..8], @bitCast(std.math.nan(f32)), .little);
    const floating = try parse(&floats, 1, false, false, .{});
    var float_points = floating.points();
    const float_point = (try float_points.next()).?.floating;
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(float_point.x)));
    try std.testing.expect(std.math.isNan(float_point.y));

    const relative_bytes = [_]u8{ 0x3f, 0xff, 0xc0, 0xaa };
    const relative = try parse(&relative_bytes, 1, true, true, .{});
    try std.testing.expectEqual(point.Encoding.relative, relative.encoding);
    try std.testing.expectEqualSlices(u8, "\xaa", relative.alignment_padding);
    var relative_points = relative.points();
    const relative_point = (try relative_points.next()).?.relative;
    try std.testing.expectEqual(@as(i16, 63), relative_point.x);
    try std.testing.expectEqual(@as(i16, -64), relative_point.y);
}

test "EMF+ PointData rejects fixed mismatch relative truncation padding and count limit" {
    const bytes = [_]u8{ 0x80, 0, 0x80, 0, 0xaa, 0xbb, 0xcc, 0xdd };
    try std.testing.expectError(error.InvalidEmfPlusPointDataSize, parse(bytes[0..7], 2, false, true, .{}));
    for (0..4) |cut|
        try std.testing.expectError(error.UnexpectedEnd, parse(bytes[0..cut], 1, true, false, .{}));
    try std.testing.expectError(error.InvalidEmfPlusPointDataPadding, parse(&bytes, 1, true, false, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(&.{}, 1, false, false, .{ .max_points = 0 }));
    _ = try parse(bytes[0..4], 1, false, true, .{ .max_points = 1 });
}

test "EMF+ relative PointData preserves every legal alignment padding width" {
    const bytes = [_]u8{ 1, 2, 0xaa, 0xbb, 0xcc };
    for (0..4) |padding_len| {
        const value = try parse(bytes[0 .. 2 + padding_len], 1, true, false, .{});
        try std.testing.expectEqual(@as(usize, 2), value.bytes.len);
        try std.testing.expectEqual(padding_len, value.alignment_padding.len);
        try std.testing.expectEqualSlices(u8, bytes[2 .. 2 + padding_len], value.alignment_padding);
    }
}
