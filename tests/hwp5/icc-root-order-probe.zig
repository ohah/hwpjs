const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 28) return error.InvalidProbeInput;
    const g = std.mem.readInt(i32, bytes[0..4], .big);
    const offset = std.mem.readInt(i32, bytes[4..8], .big);
    const first = try @import("icc-root-input.zig").select(g, offset, std.mem.readInt(i32, bytes[8..12], .big), std.mem.readInt(u32, bytes[16..20], .big));
    const second = try @import("icc-root-input.zig").select(g, offset, std.mem.readInt(i32, bytes[12..16], .big), std.mem.readInt(u32, bytes[20..24], .big));
    const order = try icc.power_root_order.inAffine(first, second, std.mem.readInt(i32, bytes[24..28], .big));
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(i32, out[0..4], switch (order) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    }, .little);
    return out;
}
