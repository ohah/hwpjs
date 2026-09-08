const shape = @import("power_level_shape.zig");
const types = @import("normalized_power_level_types.zig");
/// Positive magnitude = (numerator/denominator)^(exponent_numerator/exponent_denominator).
/// The radicand is not restricted to [0,1]; only solve's target is normalized.
pub const Radical = types.Of(128).Radical;
pub const Root = types.Of(128).Root;
pub const Finite = types.Of(128).Finite;
pub const Solutions = types.Of(128).Solutions;
pub const Wide = types.Of(512);
/// Exact BASE roots of z^(g/65536)+offset/65536=n/d, for normalized u128 target.
/// No affine x inversion, active interval test, output clipping or nearest-y choice.
pub fn solve(g: i32, offset: i32, n: u128, d: u128) !Solutions {
    return solveFor(128, g, offset, n, d);
}
/// Full u512 target, including offset subtraction wider than the target itself.
pub fn solveWide(g: i32, offset: i32, n: u512, d: u512) !Wide.Solutions {
    return solveFor(512, g, offset, n, d);
}
fn solveFor(comptime bits: u16, g: i32, offset: i32, n: types.Of(bits).Target, d: types.Of(bits).Target) !types.Of(bits).Solutions {
    const T = types.Of(bits);
    try (@import("fraction.zig").Normalized(bits){ .numerator = n, .denominator = d }).validate();
    const ordinate = @as(T.Signed, 65536) * n - @as(T.Signed, offset) * d;
    const denominator = @as(T.Unsigned, 65536) * d;
    const pattern = if (bits == 128) shape.classify(g, ordinate, denominator) else shape.classifyWide(g, ordinate, denominator);
    if (pattern == .all_nonzero) return .all_nonzero;
    var result: T.Finite = .{};
    for (pattern.finite.signs[0..pattern.finite.count]) |sign| {
        result.roots[result.count] = if (sign == .zero) .zero else .{ .nonzero = .{
            .negative = sign == .negative,
            .numerator = @abs(ordinate),
            .denominator = denominator,
            .exponent_numerator = pattern.finite.reciprocal.?.numerator,
            .exponent_denominator = pattern.finite.reciprocal.?.denominator,
        } };
        result.count += 1;
    }
    return .{ .finite = result };
}
