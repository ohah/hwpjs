const Reader = @import("../../binary/reader.zig").Reader;
pub const Stats = struct {
    units: usize = 0,
    scalar_values: usize = 0,
    unpaired_surrogates: usize = 0,
    nul_units: usize = 0,
    bom_units: usize = 0,
};
/// Raw UTF-16LE, no length prefix, terminator requirement or body controls.
/// Borrows every byte. Invalid Unicode is diagnosed, never replaced/normalized.
pub const Text = struct {
    raw: []const u8,
    stats: Stats,
    pub fn parse(bytes: []const u8) !Text {
        if (bytes.len % 2 != 0) return error.InvalidPreviewTextSize;
        var stats: Stats = .{ .units = bytes.len / 2 };
        var reader: Reader = .{ .bytes = bytes };
        var high = false;
        while (reader.offset < bytes.len) {
            const unit = try reader.readInt(u16);
            if (unit == 0) stats.nul_units += 1;
            if (unit == 0xfeff) stats.bom_units += 1;
            const low = unit >= 0xdc00 and unit <= 0xdfff;
            if (high) {
                high = false;
                if (low) {
                    stats.scalar_values += 1;
                    continue;
                }
                stats.unpaired_surrogates += 1;
            }
            if (unit >= 0xd800 and unit <= 0xdbff) {
                high = true;
            } else if (low) {
                stats.unpaired_surrogates += 1;
            } else {
                stats.scalar_values += 1;
            }
        }
        if (high) stats.unpaired_surrogates += 1;
        return .{ .raw = bytes, .stats = stats };
    }
};
