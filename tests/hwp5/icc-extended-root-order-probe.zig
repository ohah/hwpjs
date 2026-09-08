const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn root(bytes: *const [268]u8) !icc.normalized_power_level.Wide.Root {
    const sign = std.mem.readInt(i32, bytes[0..4], .big);
    if (sign == 0) {
        for (bytes[4..]) |v| if (v != 0) return error.InvalidProbeInput;
        return .zero;
    }
    if (sign != 1 and sign != -1) return error.InvalidProbeInput;
    return .{ .nonzero = .{ .negative = sign < 0, .numerator = std.mem.readInt(u1024, bytes[4..132], .big), .denominator = std.mem.readInt(u1024, bytes[132..260], .big), .exponent_numerator = std.mem.readInt(i32, bytes[260..264], .big), .exponent_denominator = std.mem.readInt(u32, bytes[264..268], .big) } };
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 540) return error.InvalidProbeInput;
    const order = try icc.normalized_root_order.Wide.inAffine(try root(bytes[0..268]), try root(bytes[268..536]), std.mem.readInt(i32, bytes[536..540], .big));
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], switch (order) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    }, .little);
    return out;
}
