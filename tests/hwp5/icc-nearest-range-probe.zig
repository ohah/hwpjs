const std = @import("std");
const icc = @import("hwpjs").image.icc;
const Fraction = @TypeOf(@as(icc.rational_range_nearest.types.Candidate, undefined).value);
fn fraction(bytes: []const u8) Fraction {
    return .{ .numerator = std.mem.readInt(u256, bytes[0..32], .big), .denominator = std.mem.readInt(u256, bytes[32..64], .big) };
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const count = std.mem.readInt(u32, bytes[32..36], .big);
    if (count > 64 or bytes.len != 36 + @as(usize, count) * 132) return error.InvalidProbeInput;
    const Range = icc.rational_range_nearest.Interval;
    const ranges = try a.alloc(Range, count);
    defer a.free(ranges);
    for (ranges, 0..) |*range, i| {
        const entry = bytes[36 + i * 132 ..][0..132];
        const flags = std.mem.readInt(u32, entry[128..132], .big);
        if (flags > 3) return error.InvalidProbeInput;
        range.* = .{ .start = fraction(entry[0..64]), .end = fraction(entry[64..128]), .start_included = flags & 1 != 0, .end_included = flags & 2 != 0 };
    }
    const result = try icc.rational_range_nearest.select(.{ .numerator = std.mem.readInt(u128, bytes[0..16], .big), .denominator = std.mem.readInt(u128, bytes[16..32], .big) }, ranges);
    const length = if (result == .nearest) result.nearest.count else 0;
    const out = try a.alloc(u8, 8 + length * 64);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .empty => 0,
        .unattained => 1,
        .nearest => 2,
    }, .little);
    std.mem.writeInt(u32, out[4..8], @intCast(length), .little);
    if (result == .nearest) for (result.nearest.values[0..length], 0..) |value, i| {
        std.mem.writeInt(u256, out[8 + i * 64 ..][0..32], value.numerator, .little);
        std.mem.writeInt(u256, out[40 + i * 64 ..][0..32], value.denominator, .little);
    };
    return out;
}
