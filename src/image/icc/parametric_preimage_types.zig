pub const Set = Of(128).Set;
pub const Result = Of(128).Result;
pub fn Of(comptime bits: u16) type {
    const Interval = if (bits == 128) @import("unit_interval.zig").WideInterval else if (bits == 512) @import("unit_interval.zig").ExtendedInterval else @compileError("unsupported parametric preimage target width");
    const PowerSet = @import("power_preimage_types.zig").Of(bits).Set;
    return struct {
        const Scope = @This();
        /// Union of branch contributions, preserving their disjoint source domains.
        /// Not a canonical interval list or a selected inverse value.
        pub const Set = struct {
            linear: ?Interval,
            power: ?PowerSet,
            pub fn isEmpty(self: @This()) bool {
                if (self.linear != null) return false;
                if (self.power) |p| return p.interval_count == 0 and p.point_count == 0;
                return true;
            }
        };
        /// No partial branch contribution is exposed when any branch is undecided.
        pub const Result = union(enum) { undecided, set: Scope.Set };
    };
}
