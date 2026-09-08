/// Exact normalized coordinate; may be unreduced.
pub const Fraction = struct {
    numerator: u64,
    denominator: u64,
    pub fn validate(self: Fraction) !void {
        if (self.denominator == 0 or self.numerator > self.denominator) return error.InvalidIccCurveCoordinate;
    }
    pub fn order(self: Fraction, other: Fraction) !@import("std").math.Order {
        try self.validate();
        try other.validate();
        return @import("std").math.order(@as(u128, self.numerator) * other.denominator, @as(u128, other.numerator) * self.denominator);
    }
    /// Lossy conversion for analytic evaluation, never used for sampled interpolation.
    pub fn toFloat(self: Fraction) !f64 {
        @setFloatMode(.strict);
        try self.validate();
        return @as(f64, @floatFromInt(self.numerator)) / @as(f64, @floatFromInt(self.denominator));
    }
};
