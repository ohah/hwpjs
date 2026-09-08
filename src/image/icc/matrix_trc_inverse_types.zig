pub const Evaluation = struct {
    linear: @import("matrix3_transform.zig").ExactVector,
    clipping: [3]@import("linear_rgb_target.zig").Clipping,
    device: [3]@import("trc_inverse.zig").Result,
    profile_semantics_deferred: bool = true,
    transform_priority_deferred: bool = true,
};
