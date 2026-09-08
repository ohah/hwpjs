pub const types = @import("gamma_wide_inverse_types.zig");
pub const Target = types.Target;
pub const Result = types.Result;
/// For positive gamma, x = target^(256/raw) is the unique inverse on [0,1].
/// Return an exact coordinate expression, not a precision-limited approximation.
pub fn invert(raw: u16, target: Target) !Result {
    try target.validate();
    const curve = try @import("gamma_parametric.zig").curve(raw);
    if (raw == 256 or target.numerator == 0 or target.numerator == target.denominator) return .{ .rational = target };
    return .{ .power = .{
        .negative = false,
        .numerator = target.numerator,
        .denominator = target.denominator,
        .exponent_numerator = 65536,
        .exponent_denominator = @intCast(curve.values[0]),
    } };
}
