const std = @import("std");

/// Exactly one raw RFC1951 stream; no zlib/gzip wrapper fallback.
/// The caller owns the result. Output is bounded during decompression.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, max_output: usize) ![]u8 {
    const result = try decodePrefix(a, bytes, max_output);
    errdefer a.free(result.bytes);
    if (result.consumed != bytes.len) return error.TrailingData;
    return result.bytes;
}

pub const Result = struct { bytes: []u8, consumed: usize };
/// Caller owns bytes; enclosing formats must validate any unconsumed trailer.
pub fn decodePrefix(a: std.mem.Allocator, bytes: []const u8, max_output: usize) !Result {
    var input: std.Io.Reader = .fixed(bytes);
    var window: [std.compress.flate.max_window_len]u8 = undefined;
    var decoder = @import("flate/Decompress.zig").init(&input, .raw, &window);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var chunk: [4096]u8 = undefined;
    while (true) {
        const remaining = max_output - output.items.len;
        // Probe one byte at the exact bound to distinguish EOF from excess output.
        const capacity = if (remaining == 0) 1 else @min(remaining, chunk.len);
        const n = decoder.reader.readSliceShort(chunk[0..capacity]) catch return error.InvalidDeflate;
        if (n > remaining) return error.LimitExceeded;
        try output.appendSlice(a, chunk[0..n]);
        if (n == 0) break;
    }
    if (decoder.err != null) return error.InvalidDeflate;
    return .{ .bytes = try output.toOwnedSlice(a), .consumed = input.seek };
}
