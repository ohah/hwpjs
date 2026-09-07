const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, edition: icc.trc_tag.Edition) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 20) return error.InvalidProbeInput;
    const parsed = (try icc.trc_tag.parse(bytes[16..20].*, bytes[20..], edition)) orelse return error.UnhandledIccTrc;
    const result = try icc.trc_forward.evaluate(parsed.curve, .{
        .numerator = std.mem.readInt(u64, bytes[0..8], .big),
        .denominator = std.mem.readInt(u64, bytes[8..16], .big),
    });
    const out = try a.alloc(u8, 32);
    @memset(out, 0);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(parsed.channel), .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(parsed.semantics_deferred), .little);
    switch (result) {
        .exact => |f| {
            std.mem.writeInt(u64, out[16..24], f.numerator, .little);
            std.mem.writeInt(u64, out[24..32], f.denominator, .little);
        },
        .approximate => |f| {
            std.mem.writeInt(u32, out[8..12], 1, .little);
            std.mem.writeInt(u64, out[16..24], @bitCast(f), .little);
        },
    }
    return out;
}
