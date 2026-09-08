const std = @import("std");
pub const Sign = enum { zero, positive, negative };
pub const Reciprocal = struct {
    numerator: i32,
    denominator: u32,
    pub fn validate(self: Reciprocal) !void {
        if ((self.numerator != 65536 and self.numerator != -65536) or self.denominator == 0 or self.denominator > 2147483648) return error.InvalidIccPowerRoot;
    }
};
pub const Finite = struct { signs: [2]Sign = undefined, count: usize = 0, reciprocal: ?Reciprocal = null };
pub const Shape = union(enum) { all_nonzero, finite: Finite };
/// Real roots of z^(g/65536)=ordinate/denominator. Callers guarantee positive denominator.
pub fn classify(g: i32, ordinate: i256, denominator: u256) Shape {
    std.debug.assert(denominator != 0);
    if (g == 0) return if (ordinate > 0 and @abs(ordinate) == denominator) .all_nonzero else .{ .finite = .{} };
    var result: Finite = .{};
    if (ordinate == 0) {
        if (g > 0) {
            result.signs[0] = .zero;
            result.count = 1;
        }
        return .{ .finite = result };
    }
    result.reciprocal = .{ .numerator = if (g < 0) -65536 else 65536, .denominator = @abs(g) };
    if (ordinate > 0) {
        result.signs[0] = .positive;
        result.count = 1;
    }
    const exponent = @import("fixed16_exponent.zig").classify(g);
    if ((ordinate < 0 and exponent == .odd_integer) or (ordinate > 0 and exponent == .even_integer)) {
        result.signs[result.count] = .negative;
        result.count += 1;
    }
    return .{ .finite = result };
}
