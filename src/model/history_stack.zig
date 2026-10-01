//! Shared ownership, branching, eviction and failure-atomic history movement.
const std = @import("std");

pub fn Stack(comptime Entry: type, comptime release: fn (*Entry) void) type {
    return struct {
        const Self = @This();
        allocator: std.mem.Allocator,
        max_entries: usize,
        undo: std.ArrayList(Entry) = .empty,
        redo: std.ArrayList(Entry) = .empty,

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
        /// Reserve before attempting a document mutation.
        pub fn prepare(self: *Self) !void {
            if (self.undo.items.len < self.max_entries) try self.undo.ensureUnusedCapacity(self.allocator, 1);
        }
        /// Only called after prepare and a successful non-noop mutation.
        pub fn commit(self: *Self, entry: Entry) void {
            clear(&self.redo);
            if (self.undo.items.len == self.max_entries) {
                var oldest = self.undo.orderedRemove(0);
                release(&oldest);
            }
            self.undo.appendAssumeCapacity(entry);
        }
        pub fn move(self: *Self, redo: bool, context: anytype, comptime exchange: anytype) !bool {
            const from = if (redo) &self.redo else &self.undo;
            const to = if (redo) &self.undo else &self.redo;
            if (from.items.len == 0) return false;
            try to.ensureUnusedCapacity(self.allocator, 1);
            try exchange(&from.items[from.items.len - 1], context);
            to.appendAssumeCapacity(from.pop().?);
            return true;
        }
        fn clear(list: *std.ArrayList(Entry)) void {
            for (list.items) |*entry| release(entry);
            list.clearRetainingCapacity();
        }
    };
}
