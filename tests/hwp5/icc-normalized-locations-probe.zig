const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn locate(comptime precision: u16, bytes: []const u8) !icc.normalized_root_location.Location {
    const solutions = try icc.normalized_power_level.solve(std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(i32, bytes[8..12], .big), std.mem.readInt(u128, bytes[12..28], .big), std.mem.readInt(u128, bytes[28..44], .big));
    if (solutions == .all_nonzero) return error.NonIsolatedIccPowerRoot;
    const index = std.mem.readInt(u32, bytes[44..48], .big);
    if (index >= solutions.finite.count) return error.InvalidIccPowerRootIndex;
    const flags = std.mem.readInt(u32, bytes[56..60], .big);
    if (flags > 3) return error.InvalidProbeInput;
    return icc.normalized_root_location.locate(precision, solutions.finite.roots[index], std.mem.readInt(i32, bytes[48..52], .big), std.mem.readInt(i32, bytes[52..56], .big), .{
        .start = .{ .numerator = std.mem.readInt(u64, bytes[60..68], .big), .denominator = std.mem.readInt(u64, bytes[68..76], .big) },
        .end = .{ .numerator = std.mem.readInt(u64, bytes[76..84], .big), .denominator = std.mem.readInt(u64, bytes[84..92], .big) },
        .start_included = flags & 1 != 0,
        .end_included = flags & 2 != 0,
    });
}
pub fn point(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 92) return error.InvalidProbeInput;
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try locate(128, bytes),
        256 => try locate(256, bytes),
        512 => try locate(512, bytes),
        1024 => try locate(1024, bytes),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(result), .little);
    return out;
}
pub fn active(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 36) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[36..]);
    const n = std.mem.readInt(u128, bytes[4..20], .big);
    const d = std.mem.readInt(u128, bytes[20..36], .big);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.normalized_level_locations.inspect(128, curve, n, d),
        256 => try icc.normalized_level_locations.inspect(256, curve, n, d),
        512 => try icc.normalized_level_locations.inspect(512, curve, n, d),
        1024 => try icc.normalized_level_locations.inspect(1024, curve, n, d),
        else => return error.InvalidIccComparisonPrecision,
    };
    const count = if (result == .roots) result.roots.count else 0;
    const out = try a.alloc(u8, 8 + 8 * count);
    std.mem.writeInt(u32, out[0..4], switch (result) {
        .inactive => 0,
        .entire => 1,
        .roots => 2,
    }, .little);
    std.mem.writeInt(u32, out[4..8], @intCast(count), .little);
    if (result == .roots) for (result.roots.entries[0..count], 0..) |entry, i| {
        const slot = out[8 + 8 * i ..][0..8];
        std.mem.writeInt(u32, slot[0..4], @intFromEnum(entry.location), .little);
        std.mem.writeInt(i32, slot[4..8], if (entry.root == .zero) 0 else if (entry.root.nonzero.negative) -1 else 1, .little);
    };
    return out;
}
