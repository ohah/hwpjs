const std = @import("std");
const F = @import("fraction.zig");
pub const Target = F.Normalized(128);
fn difference(target: Target, value: F.WideFraction) u384 {
    const left = @as(u384, value.numerator) * target.denominator;
    const right = @as(u384, target.numerator) * value.denominator;
    return @max(left, right) - @min(left, right);
}
/// Compare |a-target| and |b-target| without rounding or reduction.
pub fn compare(target: Target, a: F.WideFraction, b: F.WideFraction) !std.math.Order {
    try target.validate();
    try a.validate();
    try b.validate();
    // The positive target denominator cancels. 384+256 bits suffice.
    return std.math.order(@as(u640, difference(target, a)) * b.denominator, @as(u640, difference(target, b)) * a.denominator);
}
