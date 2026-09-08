const std = @import("std");
const integer = @import("integer_power.zig");
/// Positive rational inputs and positive p/q. The caller validates this domain.
/// Reduced A/B raised to coprime p/q is rational iff A and B are qth powers.
pub fn matches(a_: u128, b_: u128, p_: u32, q_: u32, n_: u128, d_: u128) bool {
    const base_common = std.math.gcd(a_, b_);
    const exponent_common = std.math.gcd(p_, q_);
    const p = p_ / exponent_common;
    const q = q_ / exponent_common;
    const a = integer.root(a_ / base_common, q) orelse return false;
    const b = integer.root(b_ / base_common, q) orelse return false;
    const target_common = std.math.gcd(n_, d_);
    const n = n_ / target_common;
    const d = d_ / target_common;
    return (integer.bounded(a, p, n) orelse return false) == n and
        (integer.bounded(b, p, d) orelse return false) == d;
}
