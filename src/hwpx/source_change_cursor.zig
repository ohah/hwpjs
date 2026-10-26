//! Borrow sorted disjoint source changes; consume contiguous source windows once.
const Change = @import("xml_source_writer.zig").Change;
pub const Cursor = struct {
    changes: []const Change,
    next: usize = 0,
    position: usize,
    end: usize,

    pub fn init(changes: []const Change, low: usize, high: usize) !Cursor {
        if (low > high) return error.InvalidSourceSpan;
        var previous = low;
        for (changes, 0..) |change, i| {
            if (change.start < low or change.start >= high or change.start > change.end or change.end > high or change.start < previous) return error.InvalidSourceSpan;
            if (i != 0 and change.start == changes[i - 1].start) return error.DuplicateSourceSpan;
            previous = change.end;
        }
        return .{ .changes = changes, .position = low, .end = high };
    }

    pub fn take(self: *Cursor, low: usize, high: usize) ![]const Change {
        if (low != self.position or high < low or high > self.end) return error.InvalidSourceSpan;
        const first = self.next;
        var after = first;
        while (after < self.changes.len and self.changes[after].start < high) : (after += 1) {
            const change = self.changes[after];
            if (change.start < low or change.end > high) return error.InvalidSourceSpan;
        }
        self.next = after;
        self.position = high;
        return self.changes[first..after];
    }

    pub fn finish(self: Cursor) !void {
        if (self.position != self.end or self.next != self.changes.len) return error.InvalidSourceSpan;
    }
};

test "source change cursor rejects bad inventory and consumes each change once" {
    const std = @import("std");
    const changes = [_]Change{
        .{ .start = 2, .end = 4, .text = "x" },
        .{ .start = 5, .end = 5, .text = "y" },
        .{ .start = 8, .end = 9, .text = "z" },
    };
    var c = try Cursor.init(&changes, 1, 10);
    try std.testing.expectError(error.InvalidSourceSpan, c.take(1, 3));
    try std.testing.expectEqual(@as(usize, 0), c.next);
    try std.testing.expectEqual(@as(usize, 1), (try c.take(1, 5)).len);
    try std.testing.expectEqual(@as(usize, 1), (try c.take(5, 8)).len);
    try std.testing.expectError(error.InvalidSourceSpan, c.finish());
    try std.testing.expectError(error.InvalidSourceSpan, c.take(9, 10));
    try std.testing.expectEqual(@as(usize, 1), (try c.take(8, 10)).len);
    try c.finish();
    const overlap = [_]Change{ changes[0], .{ .start = 3, .end = 6, .text = "" } };
    try std.testing.expectError(error.InvalidSourceSpan, Cursor.init(&overlap, 1, 10));
    const duplicate = [_]Change{ changes[1], changes[1] };
    try std.testing.expectError(error.DuplicateSourceSpan, Cursor.init(&duplicate, 1, 10));
    const reversed = [_]Change{ changes[2], changes[0] };
    try std.testing.expectError(error.InvalidSourceSpan, Cursor.init(&reversed, 1, 10));
    const empty = try Cursor.init(&.{}, 0, 0);
    try empty.finish();
}
