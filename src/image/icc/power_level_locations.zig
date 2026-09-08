const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const level = @import("power_level.zig");
const location = @import("affine_root_location.zig");
const set = @import("power_location_set.zig").Of(level.Root);
pub const Located = set.Located;
pub const Roots = set.Roots;
pub const Result = set.Result;
/// Level preimages in the active POWER branch only; lower affine branch is separate.
/// Unknown locations are retained. No closed/open endpoint or constant-base guesses.
pub fn inspect(comptime precision: u16, curve: Curve, target: i32) !Result {
    const power = (try segments.assemble(curve)).power orelse return .inactive;
    const solutions = level.solve(power.g, power.offset, target);
    return set.collect(precision, location, power, solutions);
}
