const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, edition: icc.trc_tag.Edition) ![]u8 {
    return runFor(128, a, bytes, limit, edition);
}
pub fn runWide(a: std.mem.Allocator, bytes: []const u8, limit: usize, edition: icc.trc_tag.Edition) ![]u8 {
    return runFor(512, a, bytes, limit, edition);
}
fn runFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize, edition: icc.trc_tag.Edition) ![]u8 {
    const width = bits / 8;
    const prefix = 4 + 2 * width;
    const U = std.meta.Int(.unsigned, bits);
    const select = if (bits == 128) icc.trc_inverse.select else icc.trc_inverse.selectWide;
    const write = if (bits == 128) @import("icc-trc-inverse-output.zig").write else @import("icc-trc-inverse-output.zig").writeWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < prefix + 4) return error.InvalidProbeInput;
    const parsed = (try icc.trc_tag.parse(bytes[prefix..][0..4].*, bytes[prefix + 4 ..], edition)) orelse return error.UnhandledIccTrc;
    const target = icc.fraction.Normalized(bits){ .numerator = std.mem.readInt(U, bytes[4..][0..width], .big), .denominator = std.mem.readInt(U, bytes[4 + width ..][0..width], .big) };
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try select(128, parsed.curve, target),
        256 => try select(256, parsed.curve, target),
        512 => try select(512, parsed.curve, target),
        1024 => try select(1024, parsed.curve, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const payload = try write(a, result);
    defer a.free(payload);
    const out = try a.alloc(u8, 8 + payload.len);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(parsed.channel), .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(parsed.semantics_deferred), .little);
    @memcpy(out[8..], payload);
    return out;
}
