const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const level = @import("power_level.zig");
const location = @import("affine_root_location.zig");
pub const Located = struct { root: level.Root, location: location.Location };
pub const Roots = struct { entries: [2]Located = undefined, count: usize = 0 };
pub const Result = union(enum) { inactive, entire, roots: Roots };
/// Level preimages in the active POWER branch only; lower affine branch is separate.
/// Unknown locations are retained. No closed/open endpoint or constant-base guesses.
pub fn inspect(comptime precision: u16, curve: Curve, target: i32) !Result {
    const power = (try segments.assemble(curve)).power orelse return .inactive;
    const solutions = level.solve(power.g, power.offset, target);
    // Whole-domain validation excludes zero bases when g=0.
    if (solutions == .all_nonzero) return .entire;
    var roots: Roots = .{};
    for (solutions.finite.roots[0..solutions.finite.count]) |root| {
        const where = try location.locate(precision, root, power.a, power.b, power.interval);
        if (where == .entire) return .entire;
        if (where == .absent) continue;
        roots.entries[roots.count] = .{ .root = root, .location = where };
        roots.count += 1;
    }
    return .{ .roots = roots };
}
