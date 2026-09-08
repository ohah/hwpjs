const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(128, a, bytes, limit);
}
pub fn runWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(512, a, bytes, limit);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const width = bits / 8;
    const U = std.meta.Int(.unsigned, bits);
    const solve = if (bits == 128) icc.linear_preimage.solve else icc.linear_preimage.solveWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 44 + 2 * width) return error.InvalidProbeInput;
    const flags = std.mem.readInt(u32, bytes[32..36], .big);
    if (flags > 3) return error.InvalidProbeInput;
    const result = try solve(.{
        .interval = .{ .start = .{ .numerator = std.mem.readInt(u64, bytes[0..8], .big), .denominator = std.mem.readInt(u64, bytes[8..16], .big) }, .end = .{ .numerator = std.mem.readInt(u64, bytes[16..24], .big), .denominator = std.mem.readInt(u64, bytes[24..32], .big) }, .start_included = flags & 1 != 0, .end_included = flags & 2 != 0 },
        .slope = std.mem.readInt(i32, bytes[36..40], .big),
        .offset = std.mem.readInt(i32, bytes[40..44], .big),
    }, std.mem.readInt(U, bytes[44..][0..width], .big), std.mem.readInt(U, bytes[44 + width ..][0..width], .big));
    const size = if (bits == 128) 136 else 520;
    const out = try a.alloc(u8, size);
    if (bits == 128) @import("icc-wide-interval-output.zig").write(out[0..136], result) else @import("icc-wide-interval-output.zig").writeExtended(out[0..520], result);
    return out;
}
