const std = @import("std");
const attained = @import("parametric_attained_inverse.zig");
const Choice = @import("parametric_nearest_types.zig").Choice;
/// Internal: caller has proved nonconstant whole monotonicity and obtained
/// choice from parametric_nearest, never from an arbitrary user witness.
pub fn resolve(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, choice: Choice) !?attained.Coordinate {
    return resolveFor(128, precision, curve, choice);
}
pub fn resolveWide(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, choice: @import("parametric_nearest_types.zig").Of(512).Choice) !?attained.Wide.Coordinate {
    return resolveFor(512, precision, curve, choice);
}
fn resolveFor(comptime bits: u16, comptime precision: u16, curve: @import("parametric_curve.zig").Curve, choice: @import("parametric_nearest_types.zig").Of(bits).Choice) !?@import("parametric_preimage_bounds_types.zig").Of(bits).Coordinate {
    const R = @import("parametric_nearest_types.zig").Of(bits).Rational;
    const U = std.meta.Int(.unsigned, bits);
    const select = if (bits == 128) attained.select else attained.selectWide;
    const value: R = switch (choice) {
        .rational => |r| r,
        .power_endpoint => |endpoint| switch (endpoint.value) {
            .rational => |r| .{ .numerator = r.numerator, .denominator = r.denominator },
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
    // Requested targets retain their input width; clipped power ordinates are 0/1.
    const n = std.math.cast(U, value.numerator) orelse return error.InvalidIccInverseTargetInvariant;
    const d = std.math.cast(U, value.denominator) orelse return error.InvalidIccInverseTargetInvariant;
    return switch (try select(precision, curve, n, d)) {
        .undecided => null,
        .missing_preimage => error.InvalidIccInversePreimageInvariant,
        .selected => |coordinate| coordinate,
    };
}
