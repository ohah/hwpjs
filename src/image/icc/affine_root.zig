const Fraction = @import("fraction.zig").Fraction;
pub const SignedRoot = struct { numerator: i64, denominator: i64 };
/// Unrestricted root with a positive denominator; null means zero slope.
pub fn unrestricted(slope: i32, offset: i32, target: i32) ?SignedRoot {
    if (slope == 0) return null;
    var n = @as(i64, target) - offset;
    var d: i64 = slope;
    if (d < 0) {
        n = -n;
        d = -d;
    }
    return .{ .numerator = n, .denominator = d };
}
/// Solve slope*x+offset=target in encoded units, restricted to [0,1].
/// A zero slope has no isolated root. All three coefficients are raw i32.
pub fn solve(slope: i32, offset: i32, target: i32) ?Fraction {
    const value = unrestricted(slope, offset, target) orelse return null;
    if (value.numerator < 0 or value.numerator > value.denominator) return null;
    return .{ .numerator = @intCast(value.numerator), .denominator = @intCast(value.denominator) };
}
