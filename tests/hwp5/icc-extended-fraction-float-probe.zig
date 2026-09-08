const std = @import("std");
fn convert(comptime bits: u16, bytes: []const u8) !f64 {
    const width = bits / 8;
    if (bytes.len != 4 + 2 * width) return error.InvalidProbeInput;
    const U = std.meta.Int(.unsigned, bits);
    const F = @import("hwpjs").image.icc.fraction.Normalized(bits);
    return (F{ .numerator = std.mem.readInt(U, bytes[4..][0..width], .big), .denominator = std.mem.readInt(U, bytes[4 + width ..][0..width], .big) }).toFloat();
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 4) return error.InvalidProbeInput;
    const value = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        256 => try convert(256, bytes),
        512 => try convert(512, bytes),
        1024 => try convert(1024, bytes),
        else => return error.InvalidProbeInput,
    };
    const out = try a.alloc(u8, 8);
    std.mem.writeInt(u64, out[0..8], @bitCast(value), .little);
    return out;
}
