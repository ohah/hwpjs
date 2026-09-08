const nearest = @import("parametric_nearest_types.zig");
pub const Selected = struct {
    ordinate: nearest.Choice,
    coordinate: @import("parametric_attained_inverse.zig").Coordinate,
};
/// Ambiguous preserves distinct closest outputs; no unspecified tie policy.
pub const Result = union(enum) { undecided, unattained, ambiguous: nearest.Tie, selected: Selected };
