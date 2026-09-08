const order = @import("power_ordinate_order.zig");
pub const types = @import("power_range_nearest_types.zig");
pub const Result = types.Result;
pub const Target = types.Target;
/// Unique closest ordinate in the closed continuous power output range.
/// Does not compare against the lower linear branch or select an inverse x.
pub fn select(comptime precision: u16, curve: @import("parametric_curve.zig").Curve, target: Target) !Result {
    try target.validate();
    const output = try @import("power_range.zig").build(precision, curve);
    const range = switch (output) {
        .inactive => return .inactive,
        .undecided => return .undecided,
        .range => |r| r,
    };
    const lower = try order.compare(precision, range.lower.value, target);
    if (lower == .gt) return .{ .endpoint = range.lower };
    if (lower == .eq) return .{ .target = target };
    const upper = try order.compare(precision, range.upper.value, target);
    if (upper == .lt) return .{ .endpoint = range.upper };
    if (upper == .eq) return .{ .target = target };
    if (lower == null or upper == null) return .undecided;
    // Continuity ensures every value between the two attained extrema exists.
    return .{ .target = target };
}
