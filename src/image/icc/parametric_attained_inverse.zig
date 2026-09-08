const Curve = @import("parametric_curve.zig").Curve;
pub const Coordinate = @import("parametric_preimage_bounds_types.zig").Coordinate;
pub const Result = Types(128).Result;
pub const Wide = Types(512);
fn Types(comptime bits: u16) type {
    return struct {
        const Self = @This();
        pub const Coordinate = @import("parametric_preimage_bounds_types.zig").Of(bits).Coordinate;
        pub const Result = union(enum) { undecided, missing_preimage, selected: Self.Coordinate };
    };
}

fn atDomainEnd(comptime bits: u16, comptime precision: u16, coordinate: Types(bits).Coordinate) !?bool {
    const compare = if (bits == 128) @import("normalized_power_root_compare.zig") else @import("normalized_power_root_compare.zig").Wide;
    return switch (coordinate) {
        .rational => |r| r.numerator == r.denominator,
        .power_root => |r| if (try compare.at(precision, r.root, r.a, r.b, .{ .numerator = 1, .denominator = 1 })) |order| order == .eq else null,
    };
}

/// F.1(a) for attained targets only, after whole-curve nonconstant monotonicity.
/// missing_preimage requires F.1(b); it is not a full inverse or nearest-y result.
pub fn select(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    return selectFor(128, precision, curve, n, d);
}
pub fn selectWide(comptime precision: u16, curve: Curve, n: u512, d: u512) !Wide.Result {
    return selectFor(512, precision, curve, n, d);
}
fn selectFor(comptime bits: u16, comptime precision: u16, curve: Curve, n: @import("std").meta.Int(.unsigned, bits), d: @import("std").meta.Int(.unsigned, bits)) !Types(bits).Result {
    const solve = if (bits == 128) @import("parametric_preimage_bounds.zig").solve else @import("parametric_preimage_bounds.zig").solveWide;
    try (@import("fraction.zig").Normalized(bits){ .numerator = n, .denominator = d }).validate();
    if (!try @import("parametric_inverse_gate.zig").validate(precision, curve)) return .undecided;
    const result = try solve(precision, curve, n, d);
    const bounds = switch (result) {
        .empty => return .missing_preimage,
        .undecided => return .undecided,
        .bounds => |b| b,
    };
    // An unattained upper boundary can never activate the domain-end exception.
    const terminal = if (bounds.upper.attained) (try atDomainEnd(bits, precision, bounds.upper.coordinate)) orelse return .undecided else false;
    return .{ .selected = switch (try @import("preimage_choice_rule.zig").select(terminal, bounds.lower.attained, bounds.upper.attained)) {
        .lower => bounds.lower.coordinate,
        .upper => bounds.upper.coordinate,
    } };
}
