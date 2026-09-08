const std = @import("std");
const attained = @import("parametric_attained_inverse.zig");
const Choice = @import("parametric_nearest_types.zig").Choice;
/// Internal: caller has proved nonconstant whole monotonicity and obtained
/// choice from parametric_nearest, never from an arbitrary user witness.
pub fn resolve(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, choice: Choice) !?attained.Coordinate {
    const value = switch (choice) {
        .rational => |r| r,
        .power_endpoint => |endpoint| switch (endpoint.value) {
            .rational => |r| r,
            .power => {
                // Strict interior power value: no clipping plateau. A non-flat
                // monotone branch has a unique x; a constant terminal branch
                // has factory witness=start, the F.1(a) minimum of that plateau.
                return .{ .rational = .{ .numerator = endpoint.at.numerator, .denominator = endpoint.at.denominator } };
            },
        },
    };
    try value.validate();
    // Factory linear ordinates have <=96-bit numerators/<=80-bit denominators;
    // requested targets are u128 and clipped power ordinates are 0/1.
    const n = std.math.cast(u128, value.numerator) orelse return error.InvalidIccInverseTargetInvariant;
    const d = std.math.cast(u128, value.denominator) orelse return error.InvalidIccInverseTargetInvariant;
    return switch (try attained.select(precision, curve, n, d)) {
        .undecided => null,
        .missing_preimage => error.InvalidIccInversePreimageInvariant,
        .selected => |coordinate| coordinate,
    };
}
