pub const Target = @import("power_ordinate_order.zig").Target;
/// Target is an attained ordinate, not its inverse coordinate.
/// Endpoint carries an actual witness, not F.1's preferred inverse.
pub const Result = union(enum) {
    inactive,
    undecided,
    target: Target,
    endpoint: @import("power_range_types.zig").Endpoint,
};
