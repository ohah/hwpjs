pub const Coordinate = Of(128).Coordinate;
pub const Endpoint = Of(128).Endpoint;
pub const Bounds = Of(128).Bounds;
pub const Result = Of(128).Result;
pub fn Of(comptime bits: u16) type {
    const F = @import("fraction.zig").Normalized(if (bits == 128) 256 else if (bits == 512) 1024 else @compileError("unsupported bound target width"));
    const Root = if (bits == 128) @import("normalized_power_level.zig").Root else @import("normalized_power_level.zig").Wide.Root;
    return struct {
        const Self = @This();
        pub const Coordinate = union(enum) { rational: F, power_root: struct { root: Root, a: i32, b: i32 } };
        pub const Endpoint = struct { coordinate: Self.Coordinate, attained: bool };
        pub const Bounds = struct { lower: Self.Endpoint, upper: Self.Endpoint };
        pub const Result = union(enum) { empty, undecided, bounds: Self.Bounds };
    };
}
