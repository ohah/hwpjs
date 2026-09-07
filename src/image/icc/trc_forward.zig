pub const Fraction = @import("fraction.zig").Fraction;
const Curve = @import("trc_tag.zig").Curve;
/// Exact identity/sampled results are not silently rounded into analytic results.
pub const Result = union(enum) {
    exact: Fraction,
    approximate: f64,
};
/// Point evaluation only. Does not discharge Parsed.semantics_deferred.
pub fn evaluate(curve: Curve, x: Fraction) !Result {
    try x.validate();
    return switch (curve) {
        .curve_type => |c| switch (c) {
            .identity => .{ .exact = x },
            .samples => |s| .{ .exact = try @import("sampled_forward.zig").evaluate(s, x) },
            .gamma => |g| .{ .approximate = try @import("gamma_forward.zig").evaluate(g, try x.toFloat()) },
        },
        .parametric => |p| .{ .approximate = try @import("parametric_forward.zig").evaluate(p, try x.toFloat()) },
    };
}
