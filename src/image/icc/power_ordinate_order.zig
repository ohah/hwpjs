const std = @import("std");
const F = @import("fraction.zig");
pub const Target = F.Normalized(128);
/// Exact ordinate relative to a normalized rational target. No distance or x selection.
/// Factory-produced power expressions retain their exact offset; null is undecided.
pub fn compare(comptime precision: u16, value: @import("power_ordinate.zig").Value, target: Target) !?std.math.Order {
    try target.validate();
    return switch (value) {
        .rational => |r| try r.order(.{ .numerator = target.numerator, .denominator = target.denominator }),
        .power => |p| blk: {
            // <=161 signed bits and <=144 unsigned bits, including minInt(i32).
            const n = @as(i256, 65536) * target.numerator - @as(i256, p.offset) * target.denominator;
            const d = @as(u256, 65536) * target.denominator;
            break :blk try @import("rational_power_order.zig").Of(256).compare(precision, p.base.numerator, p.base.denominator, p.g, n, d);
        },
    };
}
