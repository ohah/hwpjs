const power_bounds = @import("power_preimage_bounds.zig");
pub const types = @import("parametric_preimage_bounds_types.zig");
pub const Endpoint = types.Endpoint;
pub const Bounds = types.Bounds;
pub const Result = types.Result;

fn lift(endpoint: power_bounds.Endpoint, source: @import("parametric_segments.zig").Power) Endpoint {
    return .{ .coordinate = switch (endpoint.coordinate) {
        .rational => |r| .{ .rational = .{ .numerator = r.numerator, .denominator = r.denominator } },
        .root => |r| .{ .power_root = .{ .root = r, .a = source.a, .b = source.b } },
    }, .attained = endpoint.attained };
}

/// Infimum/supremum of the complete attained preimage, with attainment flags.
/// Not F.1 selection, invertibility certification, or nearest-output fallback.
pub fn solve(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, n: u128, d: u128) !Result {
    const preimage = try @import("parametric_preimage.zig").solve(precision, curve, n, d);
    if (preimage == .undecided) return .undecided;
    var result: ?Bounds = null;
    if (preimage.set.linear) |interval| result = .{
        .lower = .{ .coordinate = .{ .rational = interval.start }, .attained = interval.start_included },
        .upper = .{ .coordinate = .{ .rational = interval.end }, .attained = interval.end_included },
    };
    if (preimage.set.power) |power| switch (try power_bounds.inspect(precision, power)) {
        .undecided => return .undecided,
        .empty => {},
        .bounds => |b| {
            // assemble owns disjoint ordered domains: every lower x < every upper x.
            if (result) |*r| r.upper = lift(b.upper, power.source) else result = .{
                .lower = lift(b.lower, power.source),
                .upper = lift(b.upper, power.source),
            };
        },
    };
    return if (result) |b| .{ .bounds = b } else .empty;
}
