const matrix = @import("matrix3_fixed.zig");
pub const Input = @import("matrix3_fraction.zig").ExactVector;
pub const ExactVector = struct { numerators: [3]i512, denominator: u512 };
/// Invert signed 16.16 coefficients on arbitrary i256/u256 real XYZ.
/// x = 65536 * adj(A) * XYZ_n / (det(A) * XYZ_d).
/// Numerators have magnitude < 2^336; the positive denominator is < 2^352.
/// No normalization, clipping, narrowing, or rounding is performed.
pub fn inverse(coefficients: [9]i32, xyz: Input) !ExactVector {
    if (xyz.denominator == 0) return error.InvalidIccMatrixCoordinate;
    const det = matrix.determinantNumerator(coefficients);
    if (det == 0) return error.InvalidIccAdaptationSingular;
    var out = ExactVector{
        .numerators = @splat(0),
        .denominator = @as(u512, @intCast(if (det < 0) -det else det)) * xyz.denominator,
    };
    for (0..3) |row| {
        for (0..3) |column| out.numerators[row] += @as(i512, matrix.cofactor(coefficients, column, row)) * xyz.numerators[column];
        out.numerators[row] *= if (det < 0) @as(i512, -65536) else 65536;
    }
    return out;
}
