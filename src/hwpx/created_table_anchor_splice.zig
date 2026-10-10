//! Pure anchor plan. Mutation, UTF-16 boundaries and saving remain transactional.
const std = @import("std");
pub fn unit(point: u32, start: u32, deleted: u32, inserted: u32) !u32 {
    const change = try @import("../model/point_splice.zig").Change.init(start, deleted, inserted);
    if (change.end > std.math.maxInt(u32)) return error.LimitExceeded;
    if (change.contains(point)) return error.ProtectedCreatedTableAnchor;
    return std.math.cast(u32, try change.map(point, .right)) orelse error.LimitExceeded;
}
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
