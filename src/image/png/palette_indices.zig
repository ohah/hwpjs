/// Validate packed MSB-first indices, ignoring unused low bits in the last byte.
pub fn inspect(row: []const u8, width: u32, depth: u8, entries: usize) !void {
    if (depth != 1 and depth != 2 and depth != 4 and depth != 8) return error.UnsupportedPngFormat;
    const expected = (@as(u64, width) * depth + 7) / 8;
    if (row.len != expected) return error.InvalidPngScanlineSize;
    if (entries == 0 or entries > @as(usize, 1) << @as(u4, @intCast(depth))) return error.InvalidPngPalette;
    const per_byte = 8 / depth;
    const mask: u8 = @intCast((@as(u16, 1) << @as(u4, @intCast(depth))) - 1);
    for (0..width) |x| {
        const shift: u3 = @intCast(8 - depth * (x % per_byte + 1));
        if ((row[x / per_byte] >> shift) & mask >= entries) return error.InvalidPngPaletteIndex;
    }
}
