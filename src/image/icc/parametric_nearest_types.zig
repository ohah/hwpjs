pub const Rational = Of(128).Rational;
pub const Endpoint = @import("power_range_types.zig").Endpoint;
/// power_endpoint preserves a witness, not an F.1 inverse choice.
pub const Choice = Of(128).Choice;
/// Distinct equidistant outputs, ordered by source branch, not numeric magnitude.
pub const Tie = Of(128).Tie;
pub const Result = Of(128).Result;
pub fn Of(comptime bits: u16) type {
    return struct {
        const Self = @This();
        pub const Rational = @import("fraction.zig").Normalized(if (bits == 128) 256 else if (bits == 512) 512 else @compileError("unsupported nearest target width"));
        pub const Choice = union(enum) { rational: Self.Rational, power_endpoint: Endpoint };
        pub const Tie = struct { linear: Self.Rational, power_endpoint: Endpoint };
        pub const Result = union(enum) { undecided, unattained, selected: Self.Choice, tie: Self.Tie };
    };
}
