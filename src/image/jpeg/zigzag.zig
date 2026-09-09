/// T.81 Figure A.6: each raster cell contains its wire coefficient index.
/// This is the sole hand-maintained mapping; the inverse is derived below.
pub const wire_at_raster = [64]u6{
    0,  1,  5,  6,  14, 15, 27, 28,
    2,  4,  7,  13, 16, 26, 29, 42,
    3,  8,  12, 17, 25, 30, 41, 43,
    9,  11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
    35, 36, 48, 49, 57, 58, 62, 63,
};

pub const raster_at_wire: [64]u6 = blk: {
    var inverse: [64]u6 = undefined;
    var seen: [64]bool = @splat(false);
    for (wire_at_raster, 0..) |wire, raster| {
        if (seen[wire]) @compileError("JPEG zigzag mapping must be a permutation");
        inverse[wire] = @intCast(raster);
        seen[wire] = true;
    }
    break :blk inverse;
};

pub fn wireIndex(raster: usize) ?u6 {
    return if (raster < 64) wire_at_raster[raster] else null;
}
pub fn rasterIndex(wire: usize) ?u6 {
    return if (wire < 64) raster_at_wire[wire] else null;
}
