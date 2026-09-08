const Fraction = @import("fraction.zig").Fraction;
/// A nonempty normalized real interval, with exact endpoints and explicit inclusion.
pub const Interval = struct {
    start: Fraction,
    end: Fraction,
    start_included: bool = true,
    end_included: bool = true,
    pub fn validate(self: Interval) !void {
        const order = try self.start.order(self.end);
        if (order == .gt) return error.InvalidIccIntervalOrder;
        if (order == .eq and (!self.start_included or !self.end_included)) return error.EmptyIccInterval;
    }
    pub fn contains(self: Interval, x: Fraction) !bool {
        try self.validate();
        const lo = try x.order(self.start);
        const hi = try x.order(self.end);
        return (lo == .gt or (lo == .eq and self.start_included)) and
            (hi == .lt or (hi == .eq and self.end_included));
    }
};
