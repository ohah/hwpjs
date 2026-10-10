//! Checked zero-width coordinate mapping; object protection is caller policy.
const std = @import("std");
pub const Affinity = enum { left, right };
pub const Change = struct {
    start: usize,
    end: usize,
    inserted: usize,
    pub fn init(start: usize, deleted: usize, inserted: usize) !Change {
        return .{ .start = start, .end = std.math.add(usize, start, deleted) catch return error.LimitExceeded, .inserted = inserted };
    }
    pub fn contains(self: Change, point: usize) bool {
        return self.start < point and point < self.end;
    }
    pub fn map(self: Change, point: usize, affinity: Affinity) !usize {
        if (self.end < self.start) return error.InvalidTextPosition;
        if (point < self.start or (point == self.start and affinity == .left)) return point;
        const base = if (point <= self.end) self.start else point - (self.end - self.start);
        return std.math.add(usize, base, self.inserted) catch error.LimitExceeded;
    }
};

test "point splice affinity and malformed changes are checked" {
    const change = try Change.init(3, 2, 4);
    try std.testing.expectEqual(@as(usize, 3), try change.map(3, .left));
    try std.testing.expectEqual(@as(usize, 7), try change.map(3, .right));
    try std.testing.expectEqual(@as(usize, 8), try change.map(6, .right));
    try std.testing.expectError(error.LimitExceeded, Change.init(std.math.maxInt(usize), 1, 0));
    const invalid: Change = .{ .start = 3, .end = 2, .inserted = 0 };
    try std.testing.expectError(error.InvalidTextPosition, invalid.map(0, .left));
}
