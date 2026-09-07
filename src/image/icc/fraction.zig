/// Exact normalized coordinate; may be unreduced.
pub const Fraction = struct {
    numerator: u64,
    denominator: u64,
    pub fn validate(self: Fraction) !void {
        if (self.denominator == 0 or self.numerator > self.denominator) return error.InvalidIccCurveCoordinate;
    }
    /// Lossy conversion for analytic evaluation, never used for sampled interpolation.
    pub fn toFloat(self: Fraction) !f64 {
        @setFloatMode(.strict);
        try self.validate();
        return @as(f64, @floatFromInt(self.numerator)) / @as(f64, @floatFromInt(self.denominator));
    }
};
