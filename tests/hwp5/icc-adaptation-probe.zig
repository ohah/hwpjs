const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, tagged: bool) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (!tagged) {
        const values = try icc.s15_fixed16_array.parse(bytes);
        const out = try a.alloc(u8, bytes.len - 8);
        errdefer a.free(out);
        for (0..values.count()) |i| std.mem.writeInt(i32, out[i * 4 ..][0..4], try values.at(i), .little);
        return out;
    }
    if (bytes.len < 5 or bytes[0] > 1) return error.InvalidProbeInput;
    const value = try icc.chromatic_adaptation.parse(bytes[1..5].*, bytes[5..], if (bytes[0] == 0) .v4_2022 else .v2_2001);
    const out = try a.alloc(u8, 60);
    @memset(out, 0);
    if (value) |v| {
        std.mem.writeInt(u32, out[0..4], 1, .little);
        for (v.coefficients, 0..) |n, i| std.mem.writeInt(i32, out[4 + i * 4 ..][0..4], n, .little);
        std.mem.writeInt(u32, out[40..44], @intFromBool(v.adaptation_deferred), .little);
        std.mem.writeInt(i128, out[44..60], icc.matrix3_fixed.determinantNumerator(v.coefficients), .little);
    }
    return out;
}
