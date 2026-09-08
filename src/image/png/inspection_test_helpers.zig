const std = @import("std");
pub fn expectRejected(a: std.mem.Allocator, bytes: []const u8, options: @import("pixels.zig").Options, expected: anyerror) !void {
    _ = @import("pixels.zig").inspect(a, bytes, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(expected, err);
        return;
    };
    return error.TestExpectedError;
}
