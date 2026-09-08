const shape = @import("power_level_shape.zig");
/// Positive magnitude = (numerator/denominator)^(exponent_numerator/exponent_denominator).
/// The radicand is not restricted to [0,1]; only solve's target is normalized.
pub const Radical = @import("power_radical.zig").Of(256);
pub const Root = union(enum) { zero, nonzero: Radical };
pub const Finite = struct { roots: [2]Root = undefined, count: usize = 0 };
pub const Solutions = union(enum) { all_nonzero, finite: Finite };
/// Exact BASE roots of z^(g/65536)+offset/65536=n/d, for normalized u128 target.
/// No affine x inversion, active interval test, output clipping or nearest-y choice.
pub fn solve(g: i32, offset: i32, n: u128, d: u128) !Solutions {
    try (@import("fraction.zig").Normalized(128){ .numerator = n, .denominator = d }).validate();
    const ordinate = @as(i256, 65536) * n - @as(i256, offset) * d;
    const denominator = @as(u256, 65536) * d;
    const pattern = shape.classify(g, ordinate, denominator);
    if (pattern == .all_nonzero) return .all_nonzero;
    var result: Finite = .{};
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
