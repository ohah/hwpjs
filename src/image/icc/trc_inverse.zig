pub const types = @import("trc_inverse_types.zig");
pub const Result = types.Result;
pub const Target = types.Target;
fn parametric(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: Target) !Result {
    return switch (try @import("parametric_inverse.zig").select(precision, curve, target)) {
        .selected => |result| .{ .selected = result.coordinate },
        .undecided => .undecided,
        .unattained => .unattained,
        .ambiguous => |tie| .{ .ambiguous = tie },
    };
}
/// Exact/symbolic inverse coordinate, never an implicit f64 approximation.
/// Does not discharge Parsed.semantics_deferred or clamp signed model outputs.
pub fn select(comptime precision: u16, curve: @import("trc_tag.zig").Curve, target: Target) !Result {
    try target.validate();
    return switch (curve) {
        .curve_type => |c| switch (c) {
            .identity => .{ .selected = .{ .rational = .{ .numerator = target.numerator, .denominator = target.denominator } } },
            .samples => |samples| .{ .selected = .{ .rational = try @import("sampled_inverse.zig").invertNormalized(samples, target.numerator, target.denominator) } },
            .gamma => |raw| try parametric(precision, try @import("gamma_parametric.zig").curve(raw), target),
        },
        .parametric => |curve_| try parametric(precision, curve_, target),
    };
}
