//! Shared ownership, branching, eviction and failure-atomic history movement.
const std = @import("std");

pub fn Stack(comptime Entry: type, comptime release: fn (*Entry) void) type {
    return struct {
        const Self = @This();
        const Versioned = struct { value: Entry, revision: u32 };
        allocator: std.mem.Allocator,
        max_entries: usize,
        revision: u32 = 0,
        next_revision: u32 = 1,
        undo: std.ArrayList(Versioned) = .empty,
        redo: std.ArrayList(Versioned) = .empty,

        pub fn init(a: std.mem.Allocator, max_entries: usize) !Self {
            if (max_entries == 0) return error.LimitExceeded;
            return .{ .allocator = a, .max_entries = max_entries };
        }
        pub fn deinit(self: *Self) void {
            clear(&self.undo);
            clear(&self.redo);
            self.undo.deinit(self.allocator);
            self.redo.deinit(self.allocator);
            self.* = undefined;
        }
        pub fn revisionCount(self: *const Self) usize {
            return 1 + self.undo.items.len + self.redo.items.len;
        }
        pub fn revisionAt(self: *const Self, index: usize) ?u32 {
            if (index == 0) return self.revision;
            if (index <= self.undo.items.len) return self.undo.items[index - 1].revision;
            const redo_index = index - 1 - self.undo.items.len;
            return if (redo_index < self.redo.items.len) self.redo.items[redo_index].revision else null;
        }
        /// Reserve before attempting a document mutation.
        pub fn prepare(self: *Self) !void {
            if (self.next_revision == std.math.maxInt(u32)) return error.LimitExceeded;
            if (self.undo.items.len < self.max_entries) try self.undo.ensureUnusedCapacity(self.allocator, 1);
        }
        /// Only called after prepare and a successful non-noop mutation.
        pub fn commit(self: *Self, entry: Entry) void {
            clear(&self.redo);
            if (self.undo.items.len == self.max_entries) {
                var oldest = self.undo.orderedRemove(0);
                release(&oldest.value);
            }
            self.undo.appendAssumeCapacity(.{ .value = entry, .revision = self.revision });
            self.revision = self.next_revision;
            self.next_revision += 1;
        }
        pub fn move(self: *Self, redo: bool, context: anytype, comptime exchange: anytype) !bool {
            const from = if (redo) &self.redo else &self.undo;
            const to = if (redo) &self.undo else &self.redo;
            if (from.items.len == 0) return false;
            try to.ensureUnusedCapacity(self.allocator, 1);
            const entry = &from.items[from.items.len - 1];
            try exchange(&entry.value, context);
            std.mem.swap(u32, &entry.revision, &self.revision);
            to.appendAssumeCapacity(from.pop().?);
            return true;
        }
        fn clear(list: *std.ArrayList(Versioned)) void {
            for (list.items) |*entry| release(&entry.value);
            list.clearRetainingCapacity();
        }
    };
}

test "history revisions follow successful exchange and fresh branches" {
    const Fake = struct {
        fn release(_: *u32) void {}
        fn exchange(value: *u32, context: *u32) !void {
            if (context.* == 999) return error.Refused;
            std.mem.swap(u32, value, context);
        }
    };
    var stack = try Stack(u32, Fake.release).init(std.testing.allocator, 2);
    defer stack.deinit();
    var state: u32 = 10;
    try stack.prepare();
    stack.commit(0);
    try std.testing.expectEqual(@as(u32, 1), stack.revision);
    try std.testing.expectEqual(@as(usize, 2), stack.revisionCount());
    try std.testing.expectEqual(@as(?u32, 1), stack.revisionAt(0));
    try std.testing.expectEqual(@as(?u32, 0), stack.revisionAt(1));
    try std.testing.expectEqual(@as(?u32, null), stack.revisionAt(2));
    try std.testing.expect(try stack.move(false, &state, Fake.exchange));
    try std.testing.expectEqual(@as(u32, 0), stack.revision);
    try std.testing.expectEqual(@as(?u32, 1), stack.revisionAt(1));
    try std.testing.expect(try stack.move(true, &state, Fake.exchange));
    try std.testing.expectEqual(@as(u32, 1), stack.revision);
    state = 999;
    try std.testing.expectError(error.Refused, stack.move(false, &state, Fake.exchange));
    try std.testing.expectEqual(@as(u32, 1), stack.revision);
    state = 10;
    _ = try stack.move(false, &state, Fake.exchange);
    try stack.prepare();
    stack.commit(state);
    try std.testing.expectEqual(@as(u32, 2), stack.revision);
    try std.testing.expectEqual(@as(?u32, 0), stack.revisionAt(1));
    try std.testing.expectEqual(@as(usize, 2), stack.revisionCount());
    try std.testing.expect(!try stack.move(true, &state, Fake.exchange));
    stack.next_revision = std.math.maxInt(u32);
    try std.testing.expectError(error.LimitExceeded, stack.prepare());
    try std.testing.expectEqual(@as(u32, 2), stack.revision);
}
