const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const level = @import("normalized_power_level.zig");
const set = @import("power_location_set.zig").Of(level.Root);
pub const Located = set.Located;
pub const Roots = set.Roots;
pub const Result = set.Result;
pub const Wide = @import("power_location_set.zig").Of(level.Wide.Root);
/// Raw POWER branch only: target validation precedes whole-curve assembly.
/// Clipped flats and lower affine contributions are not included.
pub fn inspect(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    return inspectFor(128, precision, curve, n, d);
}
pub fn inspectWide(comptime precision: u16, curve: Curve, n: u512, d: u512) !Wide.Result {
    return inspectFor(512, precision, curve, n, d);
}
fn inspectFor(comptime bits: u16, comptime precision: u16, curve: Curve, n: @import("std").meta.Int(.unsigned, bits), d: @import("std").meta.Int(.unsigned, bits)) !(if (bits == 128) Result else Wide.Result) {
    try (@import("fraction.zig").Normalized(bits){ .numerator = n, .denominator = d }).validate();
    const power = (try segments.assemble(curve)).power orelse return .inactive;
    const collector = if (bits == 128) set else Wide;
    const locator = if (bits == 128) @import("normalized_root_location.zig") else @import("normalized_root_location.zig").Wide;
    const solve = if (bits == 128) level.solve else level.solveWide;
    return collector.collect(precision, locator, power, try solve(power.g, power.offset, n, d));
}
