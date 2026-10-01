//! Bounded native edit history. No display text or serialized ZIP snapshots.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoints = @import("editor_checkpoint.zig");
const Stacks = @import("../model/history_stack.zig").Stack(checkpoints.Checkpoint, release);

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
    max_checkpoint_bytes: usize,
    stack: Stacks,

    pub fn init(session: *const editor.Session, max_entries: usize, max_checkpoint_bytes: usize) !History {
        if (max_entries == 0 or max_checkpoint_bytes == 0) return error.LimitExceeded;
        _ = std.math.mul(usize, max_entries, max_checkpoint_bytes) catch return error.LimitExceeded;
        return .{ .allocator = session.allocator, .source_pointer = session.source.ptr, .max_checkpoint_bytes = max_checkpoint_bytes, .stack = try Stacks.init(session.allocator, max_entries) };
    }
    pub fn deinit(self: *History) void {
        self.stack.deinit();
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
        try self.stack.prepare();
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
        self.stack.commit(before);
        transferred = true;
        return true;
    }
    pub fn undo(self: *History, session: *editor.Session) !bool {
        try self.bind(session);
        return self.stack.move(false, session, exchange);
    }
    pub fn redo(self: *History, session: *editor.Session) !bool {
        try self.bind(session);
        return self.stack.move(true, session, exchange);
    }
};
fn release(checkpoint: *checkpoints.Checkpoint) void {
    checkpoint.deinit();
}
fn exchange(checkpoint: *checkpoints.Checkpoint, session: *editor.Session) !void {
    try checkpoint.exchange(session);
}
