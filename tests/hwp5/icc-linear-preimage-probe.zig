const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 76) return error.InvalidProbeInput;
    const flags = std.mem.readInt(u32, bytes[32..36], .big);
    if (flags > 3) return error.InvalidProbeInput;
    const result = try icc.linear_preimage.solve(.{
        .interval = .{ .start = .{ .numerator = std.mem.readInt(u64, bytes[0..8], .big), .denominator = std.mem.readInt(u64, bytes[8..16], .big) }, .end = .{ .numerator = std.mem.readInt(u64, bytes[16..24], .big), .denominator = std.mem.readInt(u64, bytes[24..32], .big) }, .start_included = flags & 1 != 0, .end_included = flags & 2 != 0 },
        .slope = std.mem.readInt(i32, bytes[36..40], .big),
        .offset = std.mem.readInt(i32, bytes[40..44], .big),
    }, std.mem.readInt(u128, bytes[44..60], .big), std.mem.readInt(u128, bytes[60..76], .big));
    const out = try a.alloc(u8, 136);
    @memset(out, 0);
    if (result) |interval| {
        std.mem.writeInt(u32, out[0..4], 1, .little);
        std.mem.writeInt(u32, out[4..8], @as(u32, @intFromBool(interval.start_included)) | (@as(u32, @intFromBool(interval.end_included)) << 1), .little);
        std.mem.writeInt(u256, out[8..40], interval.start.numerator, .little);
        std.mem.writeInt(u256, out[40..72], interval.start.denominator, .little);
        std.mem.writeInt(u256, out[72..104], interval.end.numerator, .little);
        std.mem.writeInt(u256, out[104..136], interval.end.denominator, .little);
    }
    return out;
}
