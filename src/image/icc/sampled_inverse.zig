const std = @import("std");
const Samples = @import("curve_type.zig").Samples;
/// Normalized device coordinate. Exact fraction, not necessarily reduced.
pub const Fraction = @import("fraction.zig").Fraction;
/// Wide exact output for normalized u128 inputs; never narrowed or rounded.
pub const WideFraction = struct { numerator: u256, denominator: u256 };
/// ICC.1:2022 Annex F.1, sampled piecewise-linear curves only.
/// y is encoded in 0..65535. Validates the entire curve before returning a result.
pub fn invert(samples: Samples, y: u16) !Fraction {
    const result = try invertOrdinate(samples, y, 1);
    // Encoded u16 inputs produce numerator/denominator below 2^48.
    return .{ .numerator = @intCast(result.numerator), .denominator = @intCast(result.denominator) };
}
/// Normalized input in [0,1], including exact matrix inverse denominators.
/// Signed matrix outputs must be clamped by the model layer before this call.
pub fn invertNormalized(samples: Samples, numerator: u128, denominator: u128) !WideFraction {
    if (denominator == 0 or numerator > denominator) return error.InvalidIccCurveCoordinate;
    return invertOrdinate(samples, @as(u256, numerator) * 65535, denominator);
}
/// Target is expressed in sample ordinate units, not normalized device units.
/// With a u128 denominator, scaled samples are <2^144 and results <2^176.
fn invertOrdinate(samples: Samples, numerator: u256, denominator: u128) !WideFraction {
    const count = samples.checkedCount() catch return error.InvalidIccInverseSamples;
    var rising = false;
    var falling = false;
    var previous = try samples.at(0);
    for (1..count) |i| {
        const current = try samples.at(i);
        rising = rising or current > previous;
        falling = falling or current < previous;
        previous = current;
    }
    if (rising and falling) return error.NonMonotonicIccCurve;
    if (!rising and !falling) return error.ConstantIccCurve;
    const first = try samples.at(0);
    const last = try samples.at(count - 1);
    // F.1(b): nearest ordinate when the requested y is outside the original range.
    const target = std.math.clamp(numerator, @as(u256, @min(first, last)) * denominator, @as(u256, @max(first, last)) * denominator);
    const intervals: u64 = @intCast(count - 1);
    var equal_start: ?usize = null;
    var equal_end: usize = 0;
    for (0..count) |i| {
        if (@as(u256, try samples.at(i)) * denominator == target) {
            if (equal_start == null) equal_start = i;
            equal_end = i;
        }
    }
    if (equal_start) |start| {
        // F.1(a): right edge of interior/start flats, left edge of a terminal flat.
        const index = if (equal_end == count - 1) start else equal_end;
        return .{ .numerator = @intCast(index), .denominator = intervals };
    }
    for (0..count - 1) |i| {
        const a = @as(u256, try samples.at(i)) * denominator;
        const b = @as(u256, try samples.at(i + 1)) * denominator;
        if (target > @min(a, b) and target < @max(a, b)) {
            const span = @max(a, b) - @min(a, b);
            const distance = if (rising) target - a else a - target;
            return .{ .numerator = @as(u64, @intCast(i)) * span + distance, .denominator = intervals * span };
        }
    }
    return error.InvalidIccInverseSamples;
}
