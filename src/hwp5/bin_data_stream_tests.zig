const std = @import("std");
const t = std.testing;
const stream = @import("bin_data_stream.zig");
const BinData = @import("docinfo/bin_data.zig").BinData;
const Compression = @import("docinfo/bin_data.zig").Compression;
const Header = @import("file_header.zig").Header;
const fixture = @import("document/test_fixture.zig");

fn header(compressed: bool) !Header {
    var bytes = fixture.header();
    fixture.put(&bytes, 36, u32, @intFromBool(compressed));
    return Header.parse(&bytes);
}

fn item(compression: Compression) BinData {
    return .{ .attributes = @as(u16, @intFromEnum(compression)) << 4, .data = .{ .storage = 1 }, .extra = &.{} };
}

fn exercise(a: std.mem.Allocator, default_compressed: bool, compression: Compression) !void {
    const h = try header(default_compressed);
    var input = [_]u8{ 0, 1, 2, 3, 0, 255, 128 };
    const expected_compressed = switch (compression) {
        .default => default_compressed,
        .compressed => true,
        .uncompressed => false,
        .reserved => unreachable,
    };
    const encoded = try stream.encode(a, &h, item(compression), &input, 64);
    defer a.free(encoded);
    if (expected_compressed) {
        try t.expect(!std.mem.eql(u8, &input, encoded));
        const decoded = try stream.decode(a, &h, item(compression), encoded, input.len);
        defer a.free(decoded);
        try t.expectEqualSlices(u8, &input, decoded);
    } else {
        try t.expectEqualSlices(u8, &input, encoded);
        try t.expect(encoded.ptr != input[0..].ptr);
    }
    const first = encoded[0];
    input[0] = 99;
    try t.expectEqual(first, encoded[0]);
    try t.expectError(error.LimitExceeded, stream.encode(a, &h, item(compression), &input, encoded.len - 1));
}

test "BinData encode mirrors all six header and item compression policies" {
    for ([_]bool{ false, true }) |default_compressed| for ([_]Compression{ .default, .compressed, .uncompressed }) |compression| {
        try exercise(t.allocator, default_compressed, compression);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ default_compressed, compression });
    };
}

test "BinData encode preserves feature and unsupported item rejection" {
    var h = try header(false);
    try t.expectError(error.UnsupportedCompression, stream.encode(t.allocator, &h, item(.reserved), "x", 16));
    var link = item(.uncompressed);
    link.data = .{ .link = .{ .absolute_utf16 = &.{}, .relative_utf16 = &.{} } };
    try t.expectError(error.ExternalLink, stream.encode(t.allocator, &h, link, "x", 16));
    var unknown = item(.uncompressed);
    unknown.data = .{ .unknown = &.{} };
    try t.expectError(error.UnsupportedBinDataType, stream.encode(t.allocator, &h, unknown, "x", 16));
    fixture.put(&h.raw, 36, u32, 4);
    try t.expectError(error.UnsupportedDistribution, stream.encode(t.allocator, &h, item(.uncompressed), "x", 16));
    const allowed = try stream.encodeWithPolicy(t.allocator, &h, item(.uncompressed), "x", 1, .observed_viewtext);
    defer t.allocator.free(allowed);
    try t.expectEqualStrings("x", allowed);
}
