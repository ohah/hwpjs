const std = @import("std");
const F = @import("fraction.zig");
pub const Target = F.Normalized(128);
pub const WideTarget = F.Normalized(512);
fn difference(comptime bits: u16, target: F.Normalized(bits), value: F.WideFraction) std.meta.Int(.unsigned, bits + 256) {
    const U = std.meta.Int(.unsigned, bits + 256);
    const left = @as(U, value.numerator) * target.denominator;
    const right = @as(U, target.numerator) * value.denominator;
    return @max(left, right) - @min(left, right);
}
/// Compare |a-target| and |b-target| without rounding or reduction.
pub fn compare(target: Target, a: F.WideFraction, b: F.WideFraction) !std.math.Order {
    return compareFor(128, target, a, b);
}
pub fn compareWide(target: WideTarget, a: F.WideFraction, b: F.WideFraction) !std.math.Order {
    return compareFor(512, target, a, b);
}
fn compareFor(comptime bits: u16, target: F.Normalized(bits), a: F.WideFraction, b: F.WideFraction) !std.math.Order {
    const U = std.meta.Int(.unsigned, bits + 512);
    try target.validate();
    try a.validate();
    try b.validate();
    // The positive target denominator cancels. target bits + 512 suffice.
    return std.math.order(@as(U, difference(bits, target, a)) * b.denominator, @as(U, difference(bits, target, b)) * a.denominator);
}
