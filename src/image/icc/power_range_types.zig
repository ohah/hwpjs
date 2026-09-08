pub const Ordinate = @import("power_ordinate.zig").Value;
/// at is an actual witness, not F.1's preferred inverse of this output.
pub const Endpoint = struct { at: @import("fraction.zig").Fraction, value: Ordinate };
/// The continuous power branch has a closed nonempty source and output range.
pub const Range = struct { source: @import("parametric_segments.zig").Power, lower: Endpoint, upper: Endpoint };
pub const Result = union(enum) { inactive, undecided, range: Range };
