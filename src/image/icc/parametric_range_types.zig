/// Union of output contributions, not a sorted or merged interval list.
/// Disjoint input branches may have overlapping, reversed, or separated outputs.
pub const Set = struct {
    linear: ?@import("unit_interval.zig").WideInterval,
    power: ?@import("power_range_types.zig").Range,
};
pub const Result = union(enum) { undecided, set: Set };
