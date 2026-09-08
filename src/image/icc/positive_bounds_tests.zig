const std = @import("std");
const A = @import("positive_bounds.zig").Arithmetic(128);

test "u256 fraction bounds enclose exact powers across every precision and shift sign" {
    const max = std.math.maxInt(u256);
    const values = [_]u256{ 1, 2, 3, (@as(u256, 1) << 127) - 1, @as(u256, 1) << 128, (@as(u256, 1) << 255) - 1, @as(u256, 1) << 255, max - 1, max };
    inline for (.{ 128, 256, 512, 1024 }) |bits| {
        const B = @import("positive_bounds.zig").Arithmetic(bits);
        for (values) |n| for (values) |d| {
            var exact_n: u4096 = 1;
            var exact_d: u4096 = 1;
            for (0..4) |p| {
                const interval = try B.power(try B.fraction(n, d), @intCast(p));
                for ([_]bool{ false, true }) |upper| {
                    const endpoint = if (upper) interval.upper else interval.lower;
                    var left = @as(u4096, endpoint.significand) * exact_d;
                    var right = exact_n;
                    if (endpoint.exponent >= 0) left <<= @intCast(endpoint.exponent) else right <<= @intCast(-endpoint.exponent);
                    try std.testing.expect(if (upper) left >= right else left <= right);
                }
                exact_n *= n;
                exact_d *= d;
            }
        };
        try std.testing.expectError(error.InvalidIccPositiveFraction, B.fraction(0, max));
        try std.testing.expectError(error.InvalidIccPositiveFraction, B.fraction(max, 0));
    }
}
test "directed bounds enclose exact small rational powers including rounding" {
    for (1..18) |n| for (1..18) |d| {
        var exact_n: u256 = 1;
        var exact_d: u256 = 1;
        for (0..8) |p| {
            const interval = try A.power(try A.fraction(n, d), @intCast(p));
            for ([_]bool{ false, true }) |upper| {
                const endpoint = if (upper) interval.upper else interval.lower;
                try std.testing.expect(endpoint.exponent < 0);
                const scaled = exact_n << @intCast(-endpoint.exponent);
                const actual = @as(u256, endpoint.significand) * exact_d;
                try std.testing.expect(if (upper) actual >= scaled else actual <= scaled);
            }
            exact_n *= n;
            exact_d *= d;
        }
    };
    try std.testing.expectError(error.InvalidIccPositiveFraction, A.fraction(0, 1));
    try std.testing.expectError(error.InvalidIccPositiveFraction, A.fraction(1, 0));
}
