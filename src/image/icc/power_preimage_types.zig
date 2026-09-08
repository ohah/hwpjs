const clip = @import("power_clip_types.zig");
pub const Located = Of(128).Located;
pub const Set = Of(128).Set;
pub const Result = Of(128).Result;
pub const Wide = Of(512);
pub fn Of(comptime bits: u16) type {
    const locations = @import("normalized_level_locations.zig");
    return struct {
        const Self = @This();
        pub const Located = if (bits == 128) locations.Located else if (bits == 512) locations.Wide.Located else @compileError("unsupported power preimage target width");
        /// Exact set union, not a sorted/disjoint/canonical list. Boundaries and roots
        /// denote x through source's affine coefficients; no approximate coordinates.
        pub const Set = struct {
            source: @import("parametric_segments.zig").Power,
            intervals: [6]clip.Interval = undefined,
            interval_count: usize = 0,
            points: [2]Self.Located = undefined,
            point_count: usize = 0,
        };
        /// undecided exposes no partial set. Empty set is distinct from inactive branch.
        pub const Result = union(enum) { inactive, undecided, set: Self.Set };
    };
}
