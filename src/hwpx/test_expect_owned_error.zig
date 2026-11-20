//! Test-only ownership cleanup when an expected-error call unexpectedly succeeds.
const std = @import("std");
pub fn expect(a: std.mem.Allocator, expected: anyerror, result: anytype) !void {
    if (result) |value| {
        var owned = value;
        defer owned.deinit(a);
        return error.TestExpectedError;
    } else |actual| {
        try std.testing.expectEqual(expected, @as(anyerror, actual));
    }
}
