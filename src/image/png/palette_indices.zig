/// Validate packed MSB-first indices, ignoring unused low bits in the last byte.
pub fn inspect(row: []const u8, width: u32, depth: u8, entries: usize) !void {
    return inspectWithHistogram(row, width, depth, entries, null);
}
pub fn inspectWithHistogram(row: []const u8, width: u32, depth: u8, entries: usize, frequencies: ?[]const u16) !void {
    if (depth != 1 and depth != 2 and depth != 4 and depth != 8) return error.UnsupportedPngFormat;
    const expected = (@as(u64, width) * depth + 7) / 8;
    if (row.len != expected) return error.InvalidPngScanlineSize;
    if (entries == 0 or entries > @as(usize, 1) << @as(u4, @intCast(depth))) return error.InvalidPngPalette;
    if (frequencies) |values| if (values.len != entries) return error.InvalidPngHistogramSize;
    const per_byte = 8 / depth;
    const mask: u8 = @intCast((@as(u16, 1) << @as(u4, @intCast(depth))) - 1);
    for (0..width) |x| {
        const shift: u3 = @intCast(8 - depth * (x % per_byte + 1));
        const index = (row[x / per_byte] >> shift) & mask;
        if (index >= entries) return error.InvalidPngPaletteIndex;
        if (frequencies) |values| if (values[index] == 0) return error.InvalidPngHistogramUsage;
    }
}
