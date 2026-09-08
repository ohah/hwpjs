const clip = @import("power_clip_types.zig");
pub const Located = @import("normalized_level_locations.zig").Located;
/// Exact set union, not a sorted/disjoint/canonical list. Boundaries and roots
/// denote x through source's affine coefficients; no approximate coordinates.
pub const Set = struct {
    source: @import("parametric_segments.zig").Power,
    intervals: [6]clip.Interval = undefined,
    interval_count: usize = 0,
    points: [2]Located = undefined,
    point_count: usize = 0,
};
/// undecided exposes no partial set. Empty set is distinct from inactive branch.
pub const Result = union(enum) { inactive, undecided, set: Set };
