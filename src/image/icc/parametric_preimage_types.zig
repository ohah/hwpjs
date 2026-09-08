const WideInterval = @import("unit_interval.zig").WideInterval;
const PowerSet = @import("power_preimage_types.zig").Set;
/// Union of branch contributions, preserving their disjoint source domains.
/// Not a canonical interval list or a selected inverse value.
pub const Set = struct {
    linear: ?WideInterval,
    power: ?PowerSet,
    pub fn isEmpty(self: Set) bool {
        if (self.linear != null) return false;
        if (self.power) |p| return p.interval_count == 0 and p.point_count == 0;
        return true;
    }
};
/// No partial branch contribution is exposed when any branch is undecided.
pub const Result = union(enum) { undecided, set: Set };
