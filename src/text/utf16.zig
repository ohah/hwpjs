const scalars = @import("scalars.zig");
pub const Stats = struct { scalars: usize = 0, nul_scalars: usize = 0, bom_scalars: usize = 0, ends_in_nul: bool = false };
/// No NUL termination, BOM stripping, normalization or noncharacter rejection.
pub fn inspect(bytes: []const u8, order: @import("std").builtin.Endian) !Stats {
    var result: Stats = .{};
    var offset: usize = 0;
    while (try scalars.read(bytes, offset, if (order == .big) .utf16be else .utf16le)) |c| {
        result.scalars += 1;
        result.nul_scalars += @intFromBool(c.value == 0);
        result.bom_scalars += @intFromBool(c.value == 0xfeff);
        result.ends_in_nul = c.value == 0;
        offset = c.end;
    }
    return result;
}
