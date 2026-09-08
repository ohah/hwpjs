const std = @import("std");
const A = @import("positive_bounds.zig").Arithmetic(128);
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
