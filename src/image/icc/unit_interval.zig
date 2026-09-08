const Fraction = @import("fraction.zig").Fraction;
/// A nonempty normalized real interval, with exact endpoints and explicit inclusion.
pub const Interval = struct {
    start: Fraction,
    end: Fraction,
    start_included: bool = true,
    end_included: bool = true,
    pub fn validate(self: Interval) !void {
        try self.start.validate();
        try self.end.validate();
        const a = @as(u128, self.start.numerator) * self.end.denominator;
        const b = @as(u128, self.end.numerator) * self.start.denominator;
        if (a > b) return error.InvalidIccIntervalOrder;
        if (a == b and (!self.start_included or !self.end_included)) return error.EmptyIccInterval;
    }
    pub fn contains(self: Interval, x: Fraction) !bool {
        try self.validate();
        try x.validate();
        const lo = @as(u128, x.numerator) * self.start.denominator;
        const lo_bound = @as(u128, self.start.numerator) * x.denominator;
        const hi = @as(u128, x.numerator) * self.end.denominator;
        const hi_bound = @as(u128, self.end.numerator) * x.denominator;
        return (lo > lo_bound or (lo == lo_bound and self.start_included)) and
            (hi < hi_bound or (hi == hi_bound and self.end_included));
    }
};
