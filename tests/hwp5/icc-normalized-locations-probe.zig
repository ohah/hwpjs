const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn locate(comptime bits: u16, comptime precision: u16, bytes: []const u8) !icc.normalized_root_location.Location {
    const width = bits / 8;
    const U = std.meta.Int(.unsigned, bits);
    const tail = 12 + 2 * width;
    const solve = if (bits == 128) icc.normalized_power_level.solve else icc.normalized_power_level.solveWide;
    const locator = if (bits == 128) icc.normalized_root_location else icc.normalized_root_location.Wide;
    const solutions = try solve(std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(i32, bytes[8..12], .big), std.mem.readInt(U, bytes[12..][0..width], .big), std.mem.readInt(U, bytes[12 + width ..][0..width], .big));
    if (solutions == .all_nonzero) return error.NonIsolatedIccPowerRoot;
    const index = std.mem.readInt(u32, bytes[tail..][0..4], .big);
    if (index >= solutions.finite.count) return error.InvalidIccPowerRootIndex;
    const flags = std.mem.readInt(u32, bytes[tail + 12 ..][0..4], .big);
    if (flags > 3) return error.InvalidProbeInput;
    return locator.locate(precision, solutions.finite.roots[index], std.mem.readInt(i32, bytes[tail + 4 ..][0..4], .big), std.mem.readInt(i32, bytes[tail + 8 ..][0..4], .big), .{
        .start = .{ .numerator = std.mem.readInt(u64, bytes[tail + 16 ..][0..8], .big), .denominator = std.mem.readInt(u64, bytes[tail + 24 ..][0..8], .big) },
        .end = .{ .numerator = std.mem.readInt(u64, bytes[tail + 32 ..][0..8], .big), .denominator = std.mem.readInt(u64, bytes[tail + 40 ..][0..8], .big) },
        .start_included = flags & 1 != 0,
        .end_included = flags & 2 != 0,
    });
}
pub fn point(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return pointFor(128, a, bytes, limit);
}
pub fn pointWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return pointFor(512, a, bytes, limit);
}
fn pointFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len != 60 + 2 * (bits / 8)) return error.InvalidProbeInput;
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try locate(bits, 128, bytes),
        256 => try locate(bits, 256, bytes),
        512 => try locate(bits, 512, bytes),
        1024 => try locate(bits, 1024, bytes),
        else => return error.InvalidIccComparisonPrecision,
    };
    const out = try a.alloc(u8, 4);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(result), .little);
    return out;
}
pub fn active(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return activeFor(128, a, bytes, limit);
}
pub fn activeWide(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return activeFor(512, a, bytes, limit);
}
fn activeFor(comptime bits: u16, a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const width = bits / 8;
    const U = std.meta.Int(.unsigned, bits);
    const prefix = 4 + 2 * width;
    const inspect = if (bits == 128) icc.normalized_level_locations.inspect else icc.normalized_level_locations.inspectWide;
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < prefix) return error.InvalidProbeInput;
    const curve = try icc.parametric_curve.parse(bytes[prefix..]);
    const n = std.mem.readInt(U, bytes[4..][0..width], .big);
    const d = std.mem.readInt(U, bytes[4 + width ..][0..width], .big);
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try inspect(128, curve, n, d),
        256 => try inspect(256, curve, n, d),
        512 => try inspect(512, curve, n, d),
        1024 => try inspect(1024, curve, n, d),
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
