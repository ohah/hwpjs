const types = @import("parametric_nearest_types.zig");
const Candidate = @import("nearest_ordinate_types.zig").Candidate;
pub fn linearOnly(c: Candidate) types.Result {
    return linearFor(128, c);
}
pub fn linearFor(comptime bits: u16, c: Candidate) types.Of(bits).Result {
    return if (c.attained) .{ .selected = .{ .rational = .{ .numerator = c.value.numerator, .denominator = c.value.denominator } } } else .unattained;
}
/// Both candidates come from validated range factories. The power output is attained.
pub fn combine(comptime precision: u16, target: @import("ordinate_distance.zig").Target, linear: Candidate, power: types.Endpoint) !types.Result {
    return combineFor(128, precision, target, linear, power);
}
pub fn combineFor(comptime bits: u16, comptime precision: u16, target: @import("fraction.zig").Normalized(bits), linear: Candidate, power: types.Endpoint) !types.Of(bits).Result {
    const compareDistance = if (bits == 128) @import("power_ordinate_distance.zig").compare else @import("power_ordinate_distance.zig").compareWide;
    const compareOrder = if (bits == 128) @import("power_ordinate_order.zig").compare else @import("power_ordinate_order.zig").compareWide;
    const rational = types.Of(bits).Rational{ .numerator = linear.value.numerator, .denominator = linear.value.denominator };
    const distance = (try compareDistance(precision, power.value, linear.value, target)) orelse return .undecided;
    if (distance == .lt or (distance == .eq and !linear.attained)) return .{ .selected = .{ .power_endpoint = power } };
    if (distance == .gt) return linearFor(bits, linear);
    const side = (try compareOrder(precision, power.value, target)) orelse return .undecided;
    const linear_side = try rational.order(.{ .numerator = target.numerator, .denominator = target.denominator });
    // Equal distances on the same side imply the same real value. Deduplicate.
    if (side == linear_side) return .{ .selected = .{ .rational = rational } };
    return .{ .tie = .{ .linear = rational, .power_endpoint = power } };
}
