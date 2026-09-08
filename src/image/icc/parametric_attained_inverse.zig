const Curve = @import("parametric_curve.zig").Curve;
pub const Coordinate = @import("parametric_preimage_bounds_types.zig").Coordinate;
pub const Result = union(enum) { undecided, missing_preimage, selected: Coordinate };

fn atDomainEnd(comptime precision: u16, coordinate: Coordinate) !?bool {
    return switch (coordinate) {
        .rational => |r| r.numerator == r.denominator,
        .power_root => |r| if (try @import("normalized_power_root_compare.zig").at(precision, r.root, r.a, r.b, .{ .numerator = 1, .denominator = 1 })) |order| order == .eq else null,
    };
}

/// F.1(a) for attained targets only, after whole-curve nonconstant monotonicity.
/// missing_preimage requires F.1(b); it is not a full inverse or nearest-y result.
pub fn select(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    try (@import("fraction.zig").Normalized(128){ .numerator = n, .denominator = d }).validate();
    switch (try @import("parametric_trend.zig").inspect(precision, curve)) {
        .constant => return error.ConstantIccCurve,
        .nonmonotonic => return error.NonMonotonicIccCurve,
        .undecided => return .undecided,
        .nondecreasing, .nonincreasing => {},
    }
    const result = try @import("parametric_preimage_bounds.zig").solve(precision, curve, n, d);
    const bounds = switch (result) {
        .empty => return .missing_preimage,
        .undecided => return .undecided,
        .bounds => |b| b,
    };
    // An unattained upper boundary can never activate the domain-end exception.
    const terminal = if (bounds.upper.attained) (try atDomainEnd(precision, bounds.upper.coordinate)) orelse return .undecided else false;
    return .{ .selected = switch (try @import("preimage_choice_rule.zig").select(terminal, bounds.lower.attained, bounds.upper.attained)) {
        .lower => bounds.lower.coordinate,
        .upper => bounds.upper.coordinate,
    } };
}
