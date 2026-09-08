/// Shared F.1 prerequisite. false denotes insufficient comparison precision.
pub fn validate(comptime precision: u16, curve: @import("parametric_curve.zig").Curve) !bool {
    return switch (try @import("parametric_trend.zig").inspect(precision, curve)) {
        .constant => error.ConstantIccCurve,
        .nonmonotonic => error.NonMonotonicIccCurve,
        .undecided => false,
        .nondecreasing, .nonincreasing => true,
    };
}
