const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(256, a, bytes, limit);
}
pub fn runWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runFor(1024, a, bytes, limit);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const width = bits / 8;
    const U = std.meta.Int(.unsigned, bits);
    const I = std.meta.Int(.signed, bits);
    const Root = if (bits == 256) icc.normalized_power_level.Root else icc.normalized_power_level.Wide.Root;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 16 + 4 * width) return error.InvalidProbeInput;
    const sign = std.mem.readInt(i32, bytes[4..8], .big);
    const root: Root = if (sign == 0) blk: {
        for (bytes[8 .. 16 + 2 * width]) |v| if (v != 0) return error.InvalidProbeInput;
        break :blk .zero;
    } else if (sign == 1 or sign == -1) .{ .nonzero = .{
        .negative = sign == -1,
        .numerator = std.mem.readInt(U, bytes[8..][0..width], .big),
        .denominator = std.mem.readInt(U, bytes[8 + width ..][0..width], .big),
        .exponent_numerator = std.mem.readInt(i32, bytes[8 + 2 * width ..][0..4], .big),
        .exponent_denominator = std.mem.readInt(u32, bytes[12 + 2 * width ..][0..4], .big),
    } } else return error.InvalidProbeInput;
    const n = std.mem.readInt(I, bytes[16 + 2 * width ..][0..width], .big);
    const d = std.mem.readInt(U, bytes[16 + 3 * width ..][0..width], .big);
    const compare = if (bits == 256) icc.normalized_power_root_compare.compare else icc.normalized_power_root_compare.compareWide;
    const order = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try compare(128, root, n, d),
        256 => try compare(256, root, n, d),
        512 => try compare(512, root, n, d),
        1024 => try compare(1024, root, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], if (order) |v| switch (v) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    } else 2, .little);
    return out;
}
