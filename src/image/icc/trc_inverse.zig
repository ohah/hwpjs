pub const types = @import("trc_inverse_types.zig");
pub const Result = types.Result;
pub const Target = types.Target;
pub const Wide = types.Of(512);
fn parametric(comptime bits: u16, comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: types.Of(bits).Target) !types.Of(bits).Result {
    const inverse = if (bits == 128) @import("parametric_inverse.zig").select else @import("parametric_inverse.zig").selectWide;
    return switch (try inverse(precision, curve, target)) {
        .selected => |result| .{ .selected = result.coordinate },
        .undecided => .undecided,
        .unattained => .unattained,
        .ambiguous => |tie| .{ .ambiguous = tie },
    };
}
/// Exact/symbolic inverse coordinate, never an implicit f64 approximation.
/// Does not discharge Parsed.semantics_deferred or clamp signed model outputs.
pub fn select(comptime precision: u16, curve: @import("trc_tag.zig").Curve, target: Target) !Result {
    return selectFor(128, precision, curve, target);
}
pub fn selectWide(comptime precision: u16, curve: @import("trc_tag.zig").Curve, target: Wide.Target) !Wide.Result {
    return selectFor(512, precision, curve, target);
}
fn selectFor(comptime bits: u16, comptime precision: u16, curve: @import("trc_tag.zig").Curve, target: types.Of(bits).Target) !types.Of(bits).Result {
    try target.validate();
    return switch (curve) {
        .curve_type => |c| switch (c) {
            .identity => .{ .selected = .{ .rational = .{ .numerator = target.numerator, .denominator = target.denominator } } },
            .samples => |samples| blk: {
                const inverse = if (bits == 128) @import("sampled_inverse.zig").invertNormalized else @import("sampled_inverse.zig").invertWide;
                const value = try inverse(samples, target.numerator, target.denominator);
                break :blk .{ .selected = .{ .rational = .{ .numerator = value.numerator, .denominator = value.denominator } } };
            },
            .gamma => |raw| try parametric(bits, precision, try @import("gamma_parametric.zig").curve(raw), target),
        },
        .parametric => |curve_| try parametric(bits, precision, curve_, target),
    };
}
