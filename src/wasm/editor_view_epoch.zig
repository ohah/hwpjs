//! Transport lifetime generation, not document values or an undo revision cache.
const std = @import("std");
pub const Epoch = struct {
    value: u64 = 1,
    exhausted: bool = false,
    pub fn current(self: Epoch) !u64 {
        if (self.exhausted) return error.LimitExceeded;
        return self.value;
    }
    pub fn next(self: Epoch) !u64 {
        return std.math.add(u64, try self.current(), 1) catch error.LimitExceeded;
    }
    pub fn invalidate(self: *Epoch) void {
        self.value = self.next() catch {
            self.exhausted = true;
            return;
        };
    }
};
test "view epochs never alias after lifecycle exhaustion" {
    var epoch: Epoch = .{};
    try std.testing.expectEqual(@as(u64, 2), try epoch.next());
    epoch.invalidate();
    try std.testing.expectEqual(@as(u64, 2), try epoch.current());
    epoch.value = std.math.maxInt(u64);
    try std.testing.expectError(error.LimitExceeded, epoch.next());
    epoch.invalidate();
    try std.testing.expectError(error.LimitExceeded, epoch.current());
}
