const Fraction = @import("fraction.zig").Fraction;
const Root = @import("power_level.zig").Root;
const Power = @import("parametric_segments.zig").Power;
pub const Direction = @import("curve_direction.zig").Direction;
pub const Kind = enum(u32) { zero, power, one };
pub const Level = enum(u32) {
    zero,
    one,
    pub fn encoded(self: Level) i32 {
        return if (self == .zero) 0 else 65536;
    }
};
pub const LevelRoot = struct { value: Root, level: Level };
/// A root denotes its x preimage under Plan.source's affine coefficients.
pub const Boundary = union(enum) { rational: Fraction, level_root: LevelRoot };
pub const Interval = struct { start: Boundary, end: Boundary, start_included: bool, end_included: bool };
pub const Piece = struct { interval: Interval, kind: Kind, direction: Direction };
pub const Plan = struct { source: Power, pieces: [6]Piece = undefined, count: usize = 0 };
pub const Result = union(enum) { inactive, undecided, plan: Plan };
