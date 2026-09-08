pub const Rational = @import("fraction.zig").WideFraction;
pub const Endpoint = @import("power_range_types.zig").Endpoint;
/// power_endpoint preserves a witness, not an F.1 inverse choice.
pub const Choice = union(enum) { rational: Rational, power_endpoint: Endpoint };
/// Distinct equidistant outputs, ordered by source branch, not numeric magnitude.
pub const Tie = struct { linear: Rational, power_endpoint: Endpoint };
pub const Result = union(enum) { undecided, unattained, selected: Choice, tie: Tie };
