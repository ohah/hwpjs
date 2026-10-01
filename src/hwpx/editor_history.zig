//! Bounded native edit history. No display text or serialized ZIP snapshots.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoints = @import("editor_checkpoint.zig");

pub const Command = struct {
    kind: enum { plain, anchored, field } = .plain,
    section: usize = 0,
    paragraph: usize,
    start: u32,
    deleted: u32,
    inserted: []const u8,
    begin_element: usize = 0,
};
pub const History = struct {
    allocator: std.mem.Allocator,
    source_pointer: [*]const u8,
    max_entries: usize,
    max_checkpoint_bytes: usize,
    undo_stack: std.ArrayList(checkpoints.Checkpoint) = .empty,
    redo_stack: std.ArrayList(checkpoints.Checkpoint) = .empty,

    pub fn init(session: *const editor.Session, max_entries: usize, max_checkpoint_bytes: usize) !History {
        if (max_entries == 0 or max_checkpoint_bytes == 0) return error.LimitExceeded;
        _ = std.math.mul(usize, max_entries, max_checkpoint_bytes) catch return error.LimitExceeded;
        return .{ .allocator = session.allocator, .source_pointer = session.source.ptr, .max_entries = max_entries, .max_checkpoint_bytes = max_checkpoint_bytes };
    }
    pub fn deinit(self: *History) void {
        clear(&self.undo_stack);
        clear(&self.redo_stack);
        self.undo_stack.deinit(self.allocator);
        self.redo_stack.deinit(self.allocator);
        self.* = undefined;
    }
    fn bind(self: *const History, session: *const editor.Session) !void {
        if (self.source_pointer != session.source.ptr or self.allocator.ptr != session.allocator.ptr or self.allocator.vtable != session.allocator.vtable) return error.SourceBindingMismatch;
    }
    pub fn apply(self: *History, session: *editor.Session, command: Command) !bool {
        try self.bind(session);
        var before = try checkpoints.capture(session, self.max_checkpoint_bytes);
        var transferred = false;
        defer if (!transferred) before.deinit();
        if (self.undo_stack.items.len < self.max_entries) try self.undo_stack.ensureUnusedCapacity(self.allocator, 1);
        const changed = switch (command.kind) {
            .plain => try session.splice(command.section, command.paragraph, command.start, command.deleted, command.inserted),
            .anchored => try session.spliceAnchored(command.section, command.paragraph, command.start, command.deleted, command.inserted),
            .field => try session.spliceFieldLabel(command.section, command.paragraph, command.begin_element, command.start, command.deleted, command.inserted),
        };
        if (!changed) return false;
        _ = checkpoints.size(session, self.max_checkpoint_bytes) catch |err| {
            // A growth limit failure rolls back both text and dirty values.
            before.max_bytes = std.math.maxInt(usize);
            try before.exchange(session);
            return err;
        };
        clear(&self.redo_stack);
        if (self.undo_stack.items.len == self.max_entries) {
            var oldest = self.undo_stack.orderedRemove(0);
            oldest.deinit();
        }
        self.undo_stack.appendAssumeCapacity(before);
        transferred = true;
        return true;
    }
    pub fn undo(self: *History, session: *editor.Session) !bool {
        return self.move(session, &self.undo_stack, &self.redo_stack);
    }
    pub fn redo(self: *History, session: *editor.Session) !bool {
        return self.move(session, &self.redo_stack, &self.undo_stack);
    }
    fn move(self: *History, session: *editor.Session, from: *std.ArrayList(checkpoints.Checkpoint), to: *std.ArrayList(checkpoints.Checkpoint)) !bool {
        try self.bind(session);
        if (from.items.len == 0) return false;
        try to.ensureUnusedCapacity(self.allocator, 1);
        try from.items[from.items.len - 1].exchange(session);
        to.appendAssumeCapacity(from.pop().?);
        return true;
    }
};
fn clear(stack: *std.ArrayList(checkpoints.Checkpoint)) void {
    for (stack.items) |*entry| entry.deinit();
    stack.clearRetainingCapacity();
}
