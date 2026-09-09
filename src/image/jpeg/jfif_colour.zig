/// T.871 clause 7 full-range eight-bit colour conversion. Exact rational
/// coefficients, not the rounded four-decimal approximations in the text.
/// These are JFIF colour coordinates, not an ICC/sRGB colour-management API.
pub fn toRgb(y: u8, cb: u8, cr: u8) [3]u8 {
    const luminance: i64 = y;
    const blue_difference = @as(i64, cb) - 128;
    const red_difference = @as(i64, cr) - 128;
    return .{
        quantize(luminance * 1000 + 1402 * red_difference, 1000),
        quantize(luminance * 587000 - 202008 * blue_difference - 419198 * red_difference, 587000),
        quantize(luminance * 1000 + 1772 * blue_difference, 1000),
    };
}

pub fn fromRgb(r: u8, g: u8, b: u8) [3]u8 {
    const red: i64 = r;
    const green: i64 = g;
    const blue: i64 = b;
    return .{
        quantize(299 * red + 587 * green + 114 * blue, 1000),
        quantize(-299 * red - 587 * green + 886 * blue + 128 * 1772, 1772),
        quantize(701 * red - 587 * green - 114 * blue + 128 * 1402, 1402),
    };
}

/// One-component JFIF is Y, not a biased chroma channel.
pub fn grayscale(y: u8) [3]u8 {
    return .{ y, y, y };
}

fn quantize(numerator: i64, comptime denominator: i64) u8 {
    // All denominators are positive and even. floor(x + 1/2), then clamp.
    // All intermediates for u8 inputs fit i64 with ample headroom.
    const rounded = @divFloor(numerator + denominator / 2, denominator);
    return @intCast(@min(255, @max(0, rounded)));
}
