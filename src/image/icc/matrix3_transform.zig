const matrix = @import("matrix3_fixed.zig");
/// Exact real coordinates, not re-encoded/rounded s15Fixed16 values.
/// Returned denominators are positive; fractions need not be reduced.
pub const ExactVector = struct { numerators: [3]i128, denominator: u128 };
/// Row-major matrix and vector are both signed 16.16 wire values.
/// Three i32 products sum to at most 3 * 2^62 in magnitude.
pub fn forward(coefficients: [9]i32, xyz: [3]i32) ExactVector {
    var result = ExactVector{ .numerators = @splat(0), .denominator = @as(u128, 1) << 32 };
    for (0..3) |row| for (0..3) |column| {
        result.numerators[row] += @as(i128, coefficients[row * 3 + column]) * xyz[column];
    };
    return result;
}
/// Solve A*x=y exactly using Cramer's rule. The two input 16.16 scales cancel.
/// No white-point, conditioning, clipping or profile-policy validation.
pub fn inverse(coefficients: [9]i32, xyz: [3]i32) !ExactVector {
    const denominator = matrix.determinantNumerator(coefficients);
    if (denominator == 0) return error.InvalidIccAdaptationSingular;
    var result = ExactVector{ .numerators = undefined, .denominator = @intCast(if (denominator < 0) -denominator else denominator) };
    for (0..3) |column| {
        var replaced = coefficients;
        for (0..3) |row| replaced[row * 3 + column] = xyz[row];
        const numerator = matrix.determinantNumerator(replaced);
        result.numerators[column] = if (denominator < 0) -numerator else numerator;
    }
    return result;
}
