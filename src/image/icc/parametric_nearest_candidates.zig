const types = @import("parametric_nearest_types.zig");
const Candidate = @import("nearest_ordinate_types.zig").Candidate;
pub fn linearOnly(c: Candidate) types.Result {
    return if (c.attained) .{ .selected = .{ .rational = c.value } } else .unattained;
}
/// Both candidates come from validated range factories. The power output is attained.
pub fn combine(comptime precision: u16, target: @import("ordinate_distance.zig").Target, linear: Candidate, power: types.Endpoint) !types.Result {
    const distance = (try @import("power_ordinate_distance.zig").compare(precision, power.value, linear.value, target)) orelse return .undecided;
    if (distance == .lt or (distance == .eq and !linear.attained)) return .{ .selected = .{ .power_endpoint = power } };
    if (distance == .gt) return linearOnly(linear);
    const side = (try @import("power_ordinate_order.zig").compare(precision, power.value, target)) orelse return .undecided;
    const linear_side = try linear.value.order(.{ .numerator = target.numerator, .denominator = target.denominator });
    // Equal distances on the same side imply the same real value. Deduplicate.
    if (side == linear_side) return .{ .selected = .{ .rational = linear.value } };
    return .{ .tie = .{ .linear = linear.value, .power_endpoint = power } };
}
