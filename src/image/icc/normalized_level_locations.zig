const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const level = @import("normalized_power_level.zig");
const set = @import("power_location_set.zig").Of(level.Root);
pub const Located = set.Located;
pub const Roots = set.Roots;
pub const Result = set.Result;
/// Raw POWER branch only: target validation precedes whole-curve assembly.
/// Clipped flats and lower affine contributions are not included.
pub fn inspect(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    try (@import("fraction.zig").Normalized(128){ .numerator = n, .denominator = d }).validate();
    const power = (try segments.assemble(curve)).power orelse return .inactive;
    return set.collect(precision, @import("normalized_root_location.zig"), power, try level.solve(power.g, power.offset, n, d));
}
