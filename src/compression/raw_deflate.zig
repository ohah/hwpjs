const std = @import("std");

/// Encodes one raw RFC1951 stream using only stored blocks. This deliberately
/// provides deterministic compatibility rather than compression ratio.
/// The caller owns the result and no allocation occurs above max_output.
pub fn encodeStored(a: std.mem.Allocator, bytes: []const u8, max_output: usize) ![]u8 {
    const max_block = std.math.maxInt(u16);
    const blocks = if (bytes.len == 0) @as(usize, 1) else (bytes.len - 1) / max_block + 1;
    const overhead = try std.math.mul(usize, blocks, 5);
    const size = try std.math.add(usize, bytes.len, overhead);
    if (size > max_output) return error.LimitExceeded;
    const out = try a.alloc(u8, size);
    errdefer a.free(out);
    var input_offset: usize = 0;
    var output_offset: usize = 0;
    for (0..blocks) |i| {
        const len: u16 = @intCast(@min(bytes.len - input_offset, max_block));
        out[output_offset] = if (i + 1 == blocks) 1 else 0;
        std.mem.writeInt(u16, out[output_offset + 1 ..][0..2], len, .little);
        std.mem.writeInt(u16, out[output_offset + 3 ..][0..2], ~len, .little);
        const count: usize = len;
        @memcpy(out[output_offset + 5 ..][0..count], bytes[input_offset..][0..count]);
        input_offset += count;
        output_offset += 5 + count;
    }
    std.debug.assert(input_offset == bytes.len and output_offset == out.len);
    return out;
}

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
    return decodePrefixWindow(a, bytes, max_output, 32768);
}

/// Same ownership/budget contract, with an enclosing format's distance limit.
pub fn decodePrefixWindow(a: std.mem.Allocator, bytes: []const u8, max_output: usize, max_distance: u16) !Result {
    if (max_distance == 0 or max_distance > 32768) return error.InvalidWindowSize;
    var input: std.Io.Reader = .fixed(bytes);
    var window: [std.compress.flate.max_window_len]u8 = undefined;
    var decoder = @import("flate/Decompress.zig").init(&input, .raw, &window);
    decoder.max_distance = max_distance;
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
