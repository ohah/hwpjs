const std = @import("std");
const level = @import("hwpjs").image.icc.power_level;
/// Shared 20-byte precision/g/offset/target/root-index test prefix.
pub fn selected(bytes: []const u8) !level.Root {
    if (bytes.len < 20) return error.InvalidProbeInput;
    const result = level.solve(std.mem.readInt(i32, bytes[4..8], .big), std.mem.readInt(i32, bytes[8..12], .big), std.mem.readInt(i32, bytes[12..16], .big));
    if (result != .finite) return error.NonIsolatedIccPowerRoot;
    const index = std.mem.readInt(u32, bytes[16..20], .big);
    if (index >= result.finite.count) return error.InvalidIccPowerRootIndex;
    return result.finite.roots[index];
}
