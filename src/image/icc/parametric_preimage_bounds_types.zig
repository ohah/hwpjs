pub const Coordinate = union(enum) {
    rational: @import("fraction.zig").WideFraction,
    power_root: struct { root: @import("normalized_power_level.zig").Root, a: i32, b: i32 },
};
pub const Endpoint = struct { coordinate: Coordinate, attained: bool };
pub const Bounds = struct { lower: Endpoint, upper: Endpoint };
pub const Result = union(enum) { empty, undecided, bounds: Bounds };
