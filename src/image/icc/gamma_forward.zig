const math = @import("curve_math.zig");
/// ICC 10.6 u8Fixed8 exponent. Point evaluation, not inverse gamma.
pub fn evaluate(raw: u16, x: f64) !f64 {
    @setFloatMode(.strict);
    try math.coordinate(x);
    return math.clip(try math.power(x, @as(f64, @floatFromInt(raw)) / 256));
}
