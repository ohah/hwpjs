const std = @import("std");
const scalars = @import("../../text/scalars.zig");

pub const Options = struct {
    max_bytes: usize = 65535,
    max_utf8_bytes: usize = 196605,
    max_scalars: usize = 65535,
};
pub const Text = struct {
    allocator: std.mem.Allocator,
    legacy_bytes: []const u8,
    utf16le: []const u8,
    utf16_offset: usize,
    utf8: []u8,
    scalar_count: usize,
    pub fn deinit(self: *Text) void {
        self.allocator.free(self.utf8);
        self.* = undefined;
    }
};

/// Explicit observed legacy-bytes / 00 00 / UTF-16LE / 00 00 layout.
/// Owns UTF-8 only; source slices borrow the input. No CP949 validation,
/// equality claim, normalization, BOM stripping, trimming or encoding fallback.
pub fn readObservedDual(a: std.mem.Allocator, bytes: []const u8, options: Options) !Text {
    if (bytes.len > options.max_bytes) return error.LimitExceeded;
    const split = std.mem.indexOf(u8, bytes, &.{ 0, 0 }) orelse return error.InvalidChartStringLayout;
    const offset = split + 2;
    const tail = bytes[offset..];
    if (tail.len < 2 or tail.len % 2 != 0 or !std.mem.eql(u8, tail[tail.len - 2 ..], &.{ 0, 0 }))
        return error.InvalidChartStringLayout;
    const utf16 = tail[0 .. tail.len - 2];
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    var cursor: usize = 0;
    var count: usize = 0;
    while (try scalars.read(utf16, cursor, .utf16le)) |scalar| {
        if (count >= options.max_scalars) return error.LimitExceeded;
        var encoded: [4]u8 = undefined;
        const size = try std.unicode.utf8Encode(scalar.value, &encoded);
        if (size > options.max_utf8_bytes - output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, encoded[0..size]);
        count += 1;
        cursor = scalar.end;
    }
    return .{ .allocator = a, .legacy_bytes = bytes[0..split], .utf16le = utf16, .utf16_offset = offset, .utf8 = try output.toOwnedSlice(a), .scalar_count = count };
}
