pub const types = @import("parametric_inverse_types.zig");
pub const Result = types.Result;
pub const Target = @import("fraction.zig").Normalized(128);
/// F.1 composition for normalized targets, with explicit gaps/ties/uncertainty.
pub fn select(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: Target) !Result {
    try target.validate();
    if (!try @import("parametric_inverse_gate.zig").validate(precision, curve)) return .undecided;
    return switch (try @import("parametric_nearest.zig").select(precision, curve, target)) {
        .undecided => .undecided,
        .unattained => .unattained,
        .tie => |tie| .{ .ambiguous = tie },
        .selected => |choice| .{ .selected = .{
            .ordinate = choice,
            .coordinate = (try @import("parametric_inverse_choice.zig").resolve(precision, curve, choice)) orelse return .undecided,
        } },
    };
}
