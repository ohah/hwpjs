const F = @import("fraction.zig").WideFraction;
pub const Candidate = struct { value: F, attained: bool };
/// At most two distinct real ordinates can have a given distance from a target.
pub const Nearest = struct { values: [2]F = undefined, count: usize = 0 };
pub const Result = union(enum) { empty, unattained, nearest: Nearest };
