const std = @import("std");
const integer = @import("integer_power.zig");
/// Positive rational inputs and positive p/q. The caller validates this domain.
/// Reduced A/B raised to coprime p/q is rational iff A and B are qth powers.
pub fn matches(a_: u128, b_: u128, p_: u32, q_: u32, n_: u128, d_: u128) bool {
    return Of(128).matches(a_, b_, p_, q_, n_, d_);
}
pub fn Of(comptime bits: u16) type {
    const U = switch (bits) {
        128 => u128,
        256 => u256,
        512 => u512,
        else => @compileError("rational equality width must be 128, 256 or 512"),
    };
    const I = integer.Of(bits);
    return struct {
        pub fn matches(a_: U, b_: U, p_: u32, q_: u32, n_: U, d_: U) bool {
            std.debug.assert(a_ != 0 and b_ != 0 and p_ != 0 and q_ != 0 and n_ != 0 and d_ != 0);
            const base_common = std.math.gcd(a_, b_);
            const exponent_common = std.math.gcd(p_, q_);
            const p = p_ / exponent_common;
            const q = q_ / exponent_common;
            const a = I.root(a_ / base_common, q) orelse return false;
            const b = I.root(b_ / base_common, q) orelse return false;
            const target_common = std.math.gcd(n_, d_);
            const n = n_ / target_common;
            const d = d_ / target_common;
            return (I.bounded(a, p, n) orelse return false) == n and
                (I.bounded(b, p, d) orelse return false) == d;
        }
    };
}
