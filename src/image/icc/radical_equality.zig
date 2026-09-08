const Radical = @import("power_level.zig").Radical;
const equality = @import("rational_power_equality.zig");
/// Positive rational equality, after root/coordinate validation by the caller.
/// A reduced rational A/B to coprime exponent p/q is rational iff A,B are qth powers.
pub fn matches(root: Radical, numerator: u128, denominator: u128) bool {
    const reciprocal = root.exponent_numerator < 0;
    return equality.matches(if (reciprocal) 65536 else root.numerator, if (reciprocal) root.numerator else 65536, 65536, root.exponent_denominator, numerator, denominator);
}
