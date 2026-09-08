const std = @import("std");
const F = @import("fraction.zig");
pub const Target = F.Normalized(128);
/// Exact ordinate relative to a normalized rational target. No distance or x selection.
/// Factory-produced power expressions retain their exact offset; null is undecided.
pub fn compare(comptime precision: u16, value: @import("power_ordinate.zig").Value, target: Target) !?std.math.Order {
    try target.validate();
    return switch (value) {
        .rational => |r| try r.order(.{ .numerator = target.numerator, .denominator = target.denominator }),
        .power => |p| try @import("power_ordinate_rational_order.zig").Of(128).compare(precision, p, target.numerator, target.denominator),
    };
}
