const std = @import("std");
const Samples = @import("curve_type.zig").Samples;
pub const Fraction = @import("fraction.zig").Fraction;
/// Keeps the exact normalized output representable as a u64 fraction.
/// All fractions returned by sampled_inverse fit within this bound.
pub const max_denominator = std.math.maxInt(u64) / 65535;
/// ICC.1:2022 10.6 linear interpolation, including constant/nonmonotonic curves.
/// O(1), no allocation. x must be normalized, and denominator is bounded explicitly.
pub fn evaluate(samples: Samples, x: Fraction) !Fraction {
    const count = try samples.checkedCount();
    try x.validate();
    if (x.denominator > max_denominator) return error.IccFractionLimitExceeded;
    const position = @as(u128, x.numerator) * (count - 1);
    const index: usize = @intCast(position / x.denominator);
    const remainder: u64 = @intCast(position % x.denominator);
    const a: u64 = try samples.at(index);
    if (index == count - 1) return .{ .numerator = a, .denominator = 65535 };
    const b: u64 = try samples.at(index + 1);
    return .{
        .numerator = a * (x.denominator - remainder) + b * remainder,
        .denominator = x.denominator * 65535,
    };
}
