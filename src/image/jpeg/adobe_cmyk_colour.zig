const ycc = @import("jfif_colour.zig");

fn multiply(a: u8, b: u8) u8 {
    return @intCast((@as(u16, a) * b + 127) / 255);
}

/// APP14 transform 0 stores all four CMYK channels complemented.
/// This fixed unmanaged approximation does not apply an ICC profile.
pub fn complementedCmyk(c: u8, m: u8, y: u8, k: u8) [3]u8 {
    return .{ multiply(c, k), multiply(m, k), multiply(y, k) };
}

/// APP14 transform 2 stores YCC of uncomplemented CMY and complemented K.
/// Invert the recovered CMY before an unmanaged CMYK-to-RGB multiplication.
pub fn ycck(y: u8, cb: u8, cr: u8, k: u8) [3]u8 {
    const cmy = ycc.toRgb(y, cb, cr);
    return .{ multiply(255 - cmy[0], k), multiply(255 - cmy[1], k), multiply(255 - cmy[2], k) };
}
