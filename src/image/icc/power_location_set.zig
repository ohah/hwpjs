const Location = @import("affine_root_location.zig").Location;
const Power = @import("parametric_segments.zig").Power;
/// Only called after whole-curve validation and with solutions of this power branch.
pub fn Of(comptime Root: type) type {
    return struct {
        pub const Located = struct { root: Root, location: Location };
        pub const Roots = struct { entries: [2]Located = undefined, count: usize = 0 };
        pub const Result = union(enum) { inactive, entire, roots: Roots };
        pub fn collect(comptime precision: u16, comptime locator: type, power: Power, solutions: anytype) !Result {
            // Whole-domain validation excludes zero bases when g=0.
            if (solutions == .all_nonzero) return .entire;
            var roots: Roots = .{};
            for (solutions.finite.roots[0..solutions.finite.count]) |root| {
                const where = try locator.locate(precision, root, power.a, power.b, power.interval);
                if (where == .entire) return .entire;
                if (where == .absent) continue;
                roots.entries[roots.count] = .{ .root = root, .location = where };
                roots.count += 1;
            }
            return .{ .roots = roots };
        }
    };
}
