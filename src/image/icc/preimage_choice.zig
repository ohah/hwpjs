const Interval = @import("unit_interval.zig").WideInterval;
const Fraction = @import("fraction.zig").WideFraction;
/// F.1(a) choice from a COMPLETE connected preimage, after caller-owned curve validation.
/// An unattained supremum/infimum is not an inverse value. No nearest-y fallback here.
pub fn select(interval: Interval) !Fraction {
    try interval.validate();
    if (interval.end.numerator == interval.end.denominator and interval.end_included) {
        if (!interval.start_included) return error.UnattainedIccPreimageMinimum;
        return interval.start;
    }
    if (!interval.end_included) return error.UnattainedIccPreimageMaximum;
    return interval.end;
}
