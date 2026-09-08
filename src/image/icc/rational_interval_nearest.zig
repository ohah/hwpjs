pub const Candidate = @import("nearest_ordinate_types.zig").Candidate;
pub const Projection = union(enum) { target, endpoint: Candidate };
pub fn candidate(target: @import("ordinate_distance.zig").Target, interval: @import("unit_interval.zig").WideInterval) !Candidate {
    return switch (try project(128, target, interval)) {
        .target => .{ .value = .{ .numerator = target.numerator, .denominator = target.denominator }, .attained = true },
        .endpoint => |c| c,
    };
}
/// Retains an arbitrary full-width target without narrowing it into an endpoint.
pub fn project(comptime bits: u16, target: @import("fraction.zig").Normalized(bits), interval: @import("unit_interval.zig").WideInterval) !Projection {
    const F = @import("fraction.zig").Normalized(if (bits == 128) 256 else if (bits == 512) 512 else @compileError("unsupported nearest target width"));
    try target.validate();
    try interval.validate();
    const y = F{ .numerator = target.numerator, .denominator = target.denominator };
    const promoted = @import("unit_interval.zig").Of(F){
        .start = .{ .numerator = interval.start.numerator, .denominator = interval.start.denominator },
        .end = .{ .numerator = interval.end.numerator, .denominator = interval.end.denominator },
        .start_included = interval.start_included,
        .end_included = interval.end_included,
    };
    if (try promoted.contains(y)) return .target;
    const lower = try y.order(promoted.start);
    return .{ .endpoint = if (lower != .gt) .{ .value = interval.start, .attained = interval.start_included } else .{ .value = interval.end, .attained = interval.end_included } };
}
