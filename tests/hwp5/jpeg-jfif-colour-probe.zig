const std = @import("std");
const core = @import("hwpjs");

/// Batch adapter only; colour coefficients belong to the core module.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    const gray = mode == 268;
    if (!gray and bytes.len % 3 != 0) return error.InvalidColourTriples;
    const required = try std.math.mul(usize, bytes.len, if (gray) 3 else 1);
    if (required > limit) return error.LimitExceeded;
    const out = try a.alloc(u8, required);
    const count = if (gray) bytes.len else bytes.len / 3;
    for (0..count) |i| {
        const at = i * 3;
        const value = if (gray) core.image.jpeg_jfif_colour.grayscale(bytes[i]) else if (mode == 266) core.image.jpeg_jfif_colour.toRgb(bytes[at], bytes[at + 1], bytes[at + 2]) else core.image.jpeg_jfif_colour.fromRgb(bytes[at], bytes[at + 1], bytes[at + 2]);
        @memcpy(out[at..][0..3], &value);
    }
    return out;
}
