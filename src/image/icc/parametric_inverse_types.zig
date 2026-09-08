const nearest = @import("parametric_nearest_types.zig");
pub const Selected = Of(128).Selected;
/// Ambiguous preserves distinct closest outputs; no unspecified tie policy.
pub const Result = Of(128).Result;
pub fn Of(comptime bits: u16) type {
    return struct {
        const Self = @This();
        pub const Selected = struct { ordinate: nearest.Of(bits).Choice, coordinate: @import("parametric_preimage_bounds_types.zig").Of(bits).Coordinate };
        pub const Result = union(enum) { undecided, unattained, ambiguous: nearest.Of(bits).Tie, selected: Self.Selected };
    };
}
