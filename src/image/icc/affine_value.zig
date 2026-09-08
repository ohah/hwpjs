const Fraction = @import("fraction.zig").Fraction;
pub const Value = struct { numerator: i128, denominator: u128 };
/// Exact (a*x+b)/65536 for raw signed 16.16 a/b and normalized rational x.
pub fn at(a: i32, b: i32, x: Fraction) !Value {
    try x.validate();
    return .{ .numerator = @as(i128, a) * x.numerator + @as(i128, b) * x.denominator, .denominator = @as(u128, 65536) * x.denominator };
}
