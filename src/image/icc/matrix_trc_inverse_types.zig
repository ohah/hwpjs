pub const Evaluation = Of(128).Evaluation;
pub fn Of(comptime bits: u16) type {
    const Linear = switch (bits) {
        128 => @import("matrix3_transform.zig").ExactVector,
        512 => @import("matrix3_fraction_inverse.zig").ExactVector,
        else => @compileError("unsupported matrix TRC inverse width"),
    };
    return struct {
        pub const Evaluation = struct {
            linear: Linear,
            clipping: [3]@import("linear_rgb_target.zig").Clipping,
            device: [3]@import("trc_inverse_types.zig").Of(bits).Result,
            profile_semantics_deferred: bool = true,
            transform_priority_deferred: bool = true,
        };
    };
}
