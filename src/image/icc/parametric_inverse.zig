pub const types = @import("parametric_inverse_types.zig");
pub const Result = types.Result;
pub const Target = @import("fraction.zig").Normalized(128);
pub const Wide = types.Of(512);
pub const WideTarget = @import("fraction.zig").Normalized(512);
/// F.1 composition for normalized targets, with explicit gaps/ties/uncertainty.
pub fn select(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: Target) !Result {
    return selectFor(128, precision, curve, target);
}
pub fn selectWide(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: WideTarget) !Wide.Result {
    return selectFor(512, precision, curve, target);
}
fn selectFor(comptime bits: u16, comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: @import("fraction.zig").Normalized(bits)) !types.Of(bits).Result {
    const nearest = if (bits == 128) @import("parametric_nearest.zig").select else @import("parametric_nearest.zig").selectWide;
    const resolve = if (bits == 128) @import("parametric_inverse_choice.zig").resolve else @import("parametric_inverse_choice.zig").resolveWide;
    try target.validate();
    if (!try @import("parametric_inverse_gate.zig").validate(precision, curve)) return .undecided;
    return switch (try nearest(precision, curve, target)) {
        .undecided => .undecided,
        .unattained => .unattained,
        .tie => |tie| .{ .ambiguous = tie },
        .selected => |choice| .{ .selected = .{
            .ordinate = choice,
            .coordinate = (try resolve(precision, curve, choice)) orelse return .undecided,
        } },
    };
}
