const Power = @import("parametric_segments.zig").Power;
const Fraction = @import("fraction.zig").Fraction;
pub const PowerValue = struct { base: @import("affine_value.zig").Value, g: i32, offset: i32 };
pub const Value = union(enum) {
    rational: @import("fraction.zig").WideFraction,
    /// Exact base^(g/65536)+offset/65536, proved strictly between 0 and 1.
    power: PowerValue,
};
/// Included point only. Whole-branch real-domain validation belongs to caller.
/// null means clipping could not be decided at the requested precision.
pub fn at(comptime precision: u16, source: Power, x: Fraction) !?Value {
    const level = @import("power_level_order.zig");
    const zero = (try level.at(precision, source, x, 0)) orelse return null;
    if (zero != .gt) return .{ .rational = .{ .numerator = 0, .denominator = 1 } };
    const one = (try level.at(precision, source, x, 65536)) orelse return null;
    if (one != .lt) return .{ .rational = .{ .numerator = 1, .denominator = 1 } };
    return .{ .power = .{ .base = try @import("affine_value.zig").at(source.a, source.b, x), .g = source.g, .offset = source.offset } };
}
