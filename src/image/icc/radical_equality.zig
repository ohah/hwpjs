const Radical = @import("power_level.zig").Radical;
const integer = @import("integer_power.zig");
fn gcd(a_: u128, b_: u128) u128 {
    var a = a_;
    var b = b_;
    while (b != 0) {
        const next = a % b;
        a = b;
        b = next;
    }
    return a;
}
/// Positive rational equality, after root/coordinate validation by the caller.
/// A reduced rational A/B to coprime exponent p/q is rational iff A,B are qth powers.
pub fn matches(root: Radical, numerator: u128, denominator: u128) bool {
    const common = gcd(root.numerator, 65536);
    var a: u64 = @intCast(root.numerator / common);
    var b: u64 = @intCast(65536 / common);
    if (root.exponent_numerator < 0) {
        const tmp = a;
        a = b;
        b = tmp;
    }
    const exponent_common = gcd(65536, root.exponent_denominator);
    const p: u32 = @intCast(65536 / exponent_common);
    const q: u32 = @intCast(root.exponent_denominator / exponent_common);
    const a_root = integer.root(a, q) orelse return false;
    const b_root = integer.root(b, q) orelse return false;
    const coordinate_common = gcd(numerator, denominator);
    const n = numerator / coordinate_common;
    const d = denominator / coordinate_common;
    return (integer.bounded(a_root, p, n) orelse return false) == n and
        (integer.bounded(b_root, p, d) orelse return false) == d;
}
