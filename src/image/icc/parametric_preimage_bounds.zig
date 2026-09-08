const power_bounds = @import("power_preimage_bounds.zig");
pub const types = @import("parametric_preimage_bounds_types.zig");
pub const Endpoint = types.Endpoint;
pub const Bounds = types.Bounds;
pub const Result = types.Result;
pub const Wide = types.Of(512);

fn lift(comptime bits: u16, endpoint: anytype, source: @import("parametric_segments.zig").Power) types.Of(bits).Endpoint {
    return .{ .coordinate = switch (endpoint.coordinate) {
        .rational => |r| .{ .rational = .{ .numerator = r.numerator, .denominator = r.denominator } },
        .root => |r| .{ .power_root = .{ .root = r, .a = source.a, .b = source.b } },
    }, .attained = endpoint.attained };
}

/// Infimum/supremum of the complete attained preimage, with attainment flags.
/// Not F.1 selection, invertibility certification, or nearest-output fallback.
pub fn solve(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, n: u128, d: u128) !Result {
    return solveFor(128, precision, curve, n, d);
}
pub fn solveWide(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, n: u512, d: u512) !Wide.Result {
    return solveFor(512, precision, curve, n, d);
}
fn solveFor(comptime bits: u16, comptime precision: u16, curve: @import("parametric_curve.zig").Curve, n: @import("std").meta.Int(.unsigned, bits), d: @import("std").meta.Int(.unsigned, bits)) !types.Of(bits).Result {
    const preimageSolve = if (bits == 128) @import("parametric_preimage.zig").solve else @import("parametric_preimage.zig").solveWide;
    const inspect = if (bits == 128) power_bounds.inspect else power_bounds.Wide.inspect;
    const preimage = try preimageSolve(precision, curve, n, d);
    if (preimage == .undecided) return .undecided;
    var result: ?types.Of(bits).Bounds = null;
    if (preimage.set.linear) |interval| result = .{
        .lower = .{ .coordinate = .{ .rational = interval.start }, .attained = interval.start_included },
        .upper = .{ .coordinate = .{ .rational = interval.end }, .attained = interval.end_included },
    };
    if (preimage.set.power) |power| switch (try inspect(precision, power)) {
        .undecided => return .undecided,
        .empty => {},
        .bounds => |b| {
            // assemble owns disjoint ordered domains: every lower x < every upper x.
            if (result) |*r| r.upper = lift(bits, b.upper, power.source) else result = .{
                .lower = lift(bits, b.lower, power.source),
                .upper = lift(bits, b.upper, power.source),
            };
        },
    };
    return if (result) |b| .{ .bounds = b } else .empty;
}
