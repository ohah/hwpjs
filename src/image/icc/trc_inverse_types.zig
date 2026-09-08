pub const Target = Of(128).Target;
pub const Coordinate = Of(128).Coordinate;
pub const Result = Of(128).Result;
pub fn Of(comptime bits: u16) type {
    if (bits != 128 and bits != 512) @compileError("unsupported TRC inverse width");
    return struct {
        const Self = @This();
        pub const Target = @import("fraction.zig").Normalized(bits);
        pub const Coordinate = @import("parametric_preimage_bounds_types.zig").Of(bits).Coordinate;
        pub const Result = union(enum) {
            selected: Self.Coordinate,
            undecided,
            unattained,
            ambiguous: @import("parametric_nearest_types.zig").Of(bits).Tie,
        };
    };
}
