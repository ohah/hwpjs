const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 8) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[8..]);
    const target = std.mem.readInt(i32, bytes[4..8], .big);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.power_level_locations.inspect(128, curve, target),
        256 => try icc.power_level_locations.inspect(256, curve, target),
        512 => try icc.power_level_locations.inspect(512, curve, target),
        1024 => try icc.power_level_locations.inspect(1024, curve, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const count = if (result == .roots) result.roots.count else 0;
    const out = try a.alloc(u8, 8 + count * 24);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .inactive => 0,
        .entire => 1,
        .roots => 2,
    }, .little);
    std.mem.writeInt(u32, out[4..8], @intCast(count), .little);
    if (result == .roots) for (result.roots.entries[0..count], 0..) |entry, i| {
        const slot = out[8 + 24 * i ..][0..24];
        std.mem.writeInt(u32, slot[0..4], @intFromEnum(entry.location), .little);
        @import("icc-power-root-wire.zig").write(slot[4..24], entry.root);
    };
    return out;
}
