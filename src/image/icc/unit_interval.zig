const Fraction = @import("fraction.zig").Fraction;
pub const Interval = Of(Fraction);
pub const WideInterval = Of(@import("fraction.zig").WideFraction);
/// A nonempty normalized real interval, with exact endpoints and explicit inclusion.
pub fn Of(comptime Coordinate: type) type {
    return struct {
        const Self = @This();
        start: Coordinate,
        end: Coordinate,
        start_included: bool = true,
        end_included: bool = true,
        pub fn validate(self: Self) !void {
            const order = try self.start.order(self.end);
            if (order == .gt) return error.InvalidIccIntervalOrder;
            if (order == .eq and (!self.start_included or !self.end_included)) return error.EmptyIccInterval;
        }
        pub fn contains(self: Self, x: Coordinate) !bool {
            try self.validate();
            const lo = try x.order(self.start);
            const hi = try x.order(self.end);
            return (lo == .gt or (lo == .eq and self.start_included)) and
                (hi == .lt or (hi == .eq and self.end_included));
        }
        pub fn intersection(self: Self, other: Self) !?Self {
            try self.validate();
            try other.validate();
            var result = self;
            switch (try self.start.order(other.start)) {
                .lt => {
                    result.start = other.start;
                    result.start_included = other.start_included;
                },
                .eq => result.start_included = self.start_included and other.start_included,
                .gt => {},
            }
            switch (try self.end.order(other.end)) {
                .gt => {
                    result.end = other.end;
                    result.end_included = other.end_included;
                },
                .eq => result.end_included = self.end_included and other.end_included,
                .lt => {},
            }
            const order = try result.start.order(result.end);
            if (order == .gt or (order == .eq and (!result.start_included or !result.end_included))) return null;
            return result;
        }
    };
}
pub fn widen(interval: Interval) !WideInterval {
    try interval.validate();
    return .{ .start = .{ .numerator = interval.start.numerator, .denominator = interval.start.denominator }, .end = .{ .numerator = interval.end.numerator, .denominator = interval.end.denominator }, .start_included = interval.start_included, .end_included = interval.end_included };
}
