pub const Target = @import("fraction.zig").Normalized(128);
pub const Coordinate = @import("parametric_preimage_bounds_types.zig").Coordinate;
pub const Result = union(enum) {
    selected: Coordinate,
    undecided,
    unattained,
    ambiguous: @import("parametric_nearest_types.zig").Tie,
};
