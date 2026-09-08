const F = @import("fraction.zig");
/// Closed set of values at distance <= |r-target|, without clipping to [0,1].
pub const Band = struct { lower: i386, upper: i386, denominator: u384 };
pub fn build(target: F.Normalized(128), r: F.WideFraction) !Band {
    try target.validate();
    try r.validate();
    const original = @as(i386, r.numerator) * target.denominator;
    const reflected = 2 * @as(i386, target.numerator) * r.denominator - original;
    return .{ .lower = @min(original, reflected), .upper = @max(original, reflected), .denominator = @as(u384, target.denominator) * r.denominator };
}
