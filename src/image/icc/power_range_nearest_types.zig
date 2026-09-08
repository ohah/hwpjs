pub const Target = Of(128).Target;
pub const Result = Of(128).Result;
/// Target is an attained ordinate, not its inverse coordinate.
/// Endpoint carries an actual witness, not F.1's preferred inverse.
pub fn Of(comptime bits: u16) type {
    return struct {
        const Self = @This();
        pub const Target = @import("fraction.zig").Normalized(bits);
        pub const Result = union(enum) { inactive, undecided, target: Self.Target, endpoint: @import("power_range_types.zig").Endpoint };
    };
}
