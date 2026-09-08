const std = @import("std");
const level = @import("hwpjs").image.icc.power_level;
/// Shared 20-byte precision/g/offset/target/root-index test prefix.
pub fn selected(bytes: []const u8) !level.Root {
    if (bytes.len < 20) return error.InvalidProbeInput;
    return select(std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(i32, bytes[8..12], .big), std.mem.readInt(i32, bytes[12..16], .big), std.mem.readInt(u32, bytes[16..20], .big));
}
pub fn select(g: i32, offset: i32, target: i32, index: u32) !level.Root {
    const result = level.solve(g, offset, target);
    if (result != .finite) return error.NonIsolatedIccPowerRoot;
    if (index >= result.finite.count) return error.InvalidIccPowerRootIndex;
    return result.finite.roots[index];
}
