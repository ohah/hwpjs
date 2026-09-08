const F = @import("fraction.zig");
/// Closed set of values at distance <= |r-target|, without clipping to [0,1].
pub const Band = Of(128);
pub const WideBand = Of(512);
fn Of(comptime bits: u16) type {
    const std = @import("std");
    return struct { lower: std.meta.Int(.signed, bits + 258), upper: std.meta.Int(.signed, bits + 258), denominator: std.meta.Int(.unsigned, bits + 256) };
}
pub fn build(target: F.Normalized(128), r: F.WideFraction) !Band {
    return buildFor(128, target, r);
}
pub fn buildWide(target: F.Normalized(512), r: F.WideFraction) !WideBand {
    return buildFor(512, target, r);
}
fn buildFor(comptime bits: u16, target: F.Normalized(bits), r: F.WideFraction) !Of(bits) {
    const I = @import("std").meta.Int(.signed, bits + 258);
    const U = @import("std").meta.Int(.unsigned, bits + 256);
    try target.validate();
    try r.validate();
    const original = @as(I, r.numerator) * target.denominator;
    const reflected = 2 * @as(I, target.numerator) * r.denominator - original;
    return .{ .lower = @min(original, reflected), .upper = @max(original, reflected), .denominator = @as(U, target.denominator) * r.denominator };
}
