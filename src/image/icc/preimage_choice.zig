const Interval = @import("unit_interval.zig").WideInterval;
const Fraction = @import("fraction.zig").WideFraction;
/// F.1(a) choice from a COMPLETE connected preimage, after caller-owned curve validation.
/// An unattained supremum/infimum is not an inverse value. No nearest-y fallback here.
pub fn select(interval: Interval) !Fraction {
    try interval.validate();
    return switch (try @import("preimage_choice_rule.zig").select(interval.end.numerator == interval.end.denominator, interval.start_included, interval.end_included)) {
        .lower => interval.start,
        .upper => interval.end,
    };
}
