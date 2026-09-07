/// PNG method 0, one packed byte scanline in place. No allocation.
/// previous must be a disjoint reconstructed row, or null at a pass boundary.
/// stride is bytes per pixel rounded up, not sample depth or channel count.
pub fn restore(kind: u8, stride: usize, row: []u8, previous: ?[]const u8) !void {
    if (kind > 4) return error.InvalidPngFilter;
    if (stride == 0 or stride > 8) return error.InvalidPngFilterStride;
    if (previous) |prev| {
        if (prev.len != row.len) return error.InvalidPngPreviousRow;
        const x = @intFromPtr(row.ptr);
        const y = @intFromPtr(prev.ptr);
        if (if (x <= y) y - x < row.len else x - y < prev.len)
            return error.OverlappingPngRows;
    }
    for (row, 0..) |*byte, i| {
        const left: u8 = if (i >= stride) row[i - stride] else 0;
        const above: u8 = if (previous) |prev| prev[i] else 0;
        const corner: u8 = if (previous) |prev| (if (i >= stride) prev[i - stride] else 0) else 0;
        const prediction: u8 = switch (kind) {
            0 => 0,
            1 => left,
            2 => above,
            3 => @intCast((@as(u16, left) + above) / 2),
            4 => paeth(left, above, corner),
            else => unreachable,
        };
        byte.* +%= prediction;
    }
}

pub fn paeth(a: u8, b: u8, c: u8) u8 {
    const p = @as(i16, a) + b - c;
    const da = @abs(p - a);
    const db = @abs(p - b);
    const dc = @abs(p - c);
    if (da <= db and da <= dc) return a;
    if (db <= dc) return b;
    return c;
}
