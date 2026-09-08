const std = @import("std");
/// Directed integer significand bounds, used only for positive rational powers.
pub fn Arithmetic(comptime bits: u16) type {
    const U = switch (bits) {
        128 => u128,
        256 => u256,
        512 => u512,
        1024 => u1024,
        else => @compileError("precision must be 128, 256, 512 or 1024"),
    };
    const W = switch (bits) {
        128 => u256,
        256 => u512,
        512 => u1024,
        1024 => u2048,
        else => unreachable,
    };
    return struct {
        const Endpoint = struct { significand: U, exponent: i64 };
        pub const Interval = struct { lower: Endpoint, upper: Endpoint };
        fn normalize(value: W, exponent: i64, upward: bool) !Endpoint {
            const length: u16 = @intCast(@bitSizeOf(W) - @clz(value));
            var e = exponent;
            var n = value;
            if (length > bits) {
                const shift = length - bits;
                n = value >> @intCast(shift);
                if (upward and value & ((@as(W, 1) << @intCast(shift)) - 1) != 0) n += 1;
                e = try std.math.add(i64, e, shift);
                if (n > std.math.maxInt(U)) {
                    n >>= 1;
                    e = try std.math.add(i64, e, 1);
                }
            } else if (length < bits) {
                const shift = bits - length;
                n <<= @intCast(shift);
                e = try std.math.sub(i64, e, shift);
            }
            return .{ .significand = @intCast(n), .exponent = e };
        }
        pub fn fraction(n: u128, d: u128) !Interval {
            if (n == 0 or d == 0) return error.InvalidIccPositiveFraction;
            const shift: u16 = @intCast(@as(i32, bits) - 1 + @as(i32, @intCast(@clz(n))) - @as(i32, @intCast(@clz(d))));
            const scaled = @as(W, n) << @intCast(shift);
            const quotient = scaled / d;
            const e = -@as(i64, shift);
            return .{ .lower = try normalize(quotient, e, false), .upper = try normalize(quotient + @intFromBool(scaled % d != 0), e, true) };
        }
        fn endpointProduct(a: Endpoint, b: Endpoint, upward: bool) !Endpoint {
            return normalize(@as(W, a.significand) * b.significand, try std.math.add(i64, a.exponent, b.exponent), upward);
        }
        fn multiply(a: Interval, b: Interval) !Interval {
            return .{ .lower = try endpointProduct(a.lower, b.lower, false), .upper = try endpointProduct(a.upper, b.upper, true) };
        }
        pub fn power(base: Interval, exponent: u32) !Interval {
            var result = try fraction(1, 1);
            var factor = base;
            var remaining = exponent;
            while (remaining != 0) {
                if (remaining & 1 != 0) result = try multiply(result, factor);
                remaining >>= 1;
                if (remaining != 0) factor = try multiply(factor, factor);
            }
            return result;
        }
        fn order(a: Endpoint, b: Endpoint) std.math.Order {
            const e = std.math.order(a.exponent, b.exponent);
            return if (e != .eq) e else std.math.order(a.significand, b.significand);
        }
        /// Overlap is undecided, never approximate equality.
        pub fn separated(a: Interval, b: Interval) ?std.math.Order {
            if (order(a.upper, b.lower) == .lt) return .lt;
            if (order(a.lower, b.upper) == .gt) return .gt;
            return null;
        }
    };
}
