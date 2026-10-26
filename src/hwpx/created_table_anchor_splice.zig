//! Pure anchor plan. Mutation, UTF-16 boundaries and saving remain transactional.
const std = @import("std");
pub const unit = @import("../model/protected_point_splice.zig").unit;
test "created table splice coordinates preserve points and refuse crossing and overflow" {
    for (0..12) |point| for (0..12) |start| for (0..6) |deleted| for (0..6) |inserted| {
        if (start < point and point < start + deleted) {
            try std.testing.expectError(error.ProtectedCreatedTableAnchor, unit(@intCast(point), @intCast(start), @intCast(deleted), @intCast(inserted)));
        } else {
            // Independent signed displacement, not the production base formula.
            const expected: i64 = if (point < start) @intCast(point) else @as(i64, @intCast(point)) - @as(i64, @intCast(@min(deleted, point - start))) + @as(i64, @intCast(inserted));
            try std.testing.expectEqual(@as(u32, @intCast(expected)), try unit(@intCast(point), @intCast(start), @intCast(deleted), @intCast(inserted)));
        }
    };
    try std.testing.expectError(error.LimitExceeded, unit(0, std.math.maxInt(u32), 1, 0));
    try std.testing.expectError(error.LimitExceeded, unit(std.math.maxInt(u32), 0, 0, 1));
}
