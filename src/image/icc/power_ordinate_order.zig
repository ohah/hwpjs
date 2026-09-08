const std = @import("std");
const F = @import("fraction.zig");
pub const Target = F.Normalized(128);
pub const WideTarget = F.Normalized(512);
/// Exact ordinate relative to a normalized rational target. No distance or x selection.
/// Factory-produced power expressions retain their exact offset; null is undecided.
pub fn compare(comptime precision: u16, value: @import("power_ordinate.zig").Value, target: Target) !?std.math.Order {
    return compareFor(128, precision, value, target);
}
pub fn compareWide(comptime precision: u16, value: @import("power_ordinate.zig").Value, target: WideTarget) !?std.math.Order {
    return compareFor(512, precision, value, target);
}
fn compareFor(comptime bits: u16, comptime precision: u16, value: @import("power_ordinate.zig").Value, target: F.Normalized(bits)) !?std.math.Order {
    const R = F.Normalized(if (bits == 128) 256 else 512);
    try target.validate();
    return switch (value) {
        .rational => |r| try (R{ .numerator = r.numerator, .denominator = r.denominator }).order(.{ .numerator = target.numerator, .denominator = target.denominator }),
        .power => |p| try @import("power_ordinate_rational_order.zig").Of(bits).compare(precision, p, target.numerator, target.denominator),
    };
}
