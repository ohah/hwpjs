const Fraction = @import("fraction.zig").Fraction;
/// Wide exact real coordinates. Full u64 denominators need more than i128.
pub const ExactVector = struct { numerators: [3]i256, denominator: u256 };
/// Coefficients are signed 16.16; inputs are exact normalized fractions.
/// Denominator < 2^208, and sum of three numerator terms has magnitude < 2^225.
pub fn forward(matrix: [9]i32, xyz: [3]Fraction) !ExactVector {
    for (xyz) |x| try x.validate();
    var out = ExactVector{
        .numerators = @splat(0),
        .denominator = @as(u256, xyz[0].denominator) * xyz[1].denominator * xyz[2].denominator * 65536,
    };
    for (0..3) |row| for (0..3) |column| {
        out.numerators[row] += @as(i256, matrix[row * 3 + column]) * xyz[column].numerator * xyz[(column + 1) % 3].denominator * xyz[(column + 2) % 3].denominator;
    };
    return out;
}
