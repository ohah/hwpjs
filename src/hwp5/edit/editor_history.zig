//! HWP5 adapter: current native values are authoritative, never saved HWP bytes.
const std = @import("std");
const edit = @import("style_preservation.zig");
const Stacks = @import("../../model/history_stack.zig").Stack(*edit.Checkpoint, release);

pub const History = struct {
    owner: *edit.Session,
    max_checkpoint_bytes: usize,
    stack: Stacks,

    pub fn init(a: std.mem.Allocator, session: *edit.Session, max_entries: usize, max_checkpoint_bytes: usize) !History {
        if (max_checkpoint_bytes == 0) return error.LimitExceeded;
        _ = std.math.mul(usize, max_entries, max_checkpoint_bytes) catch return error.LimitExceeded;
        return .{ .owner = session, .max_checkpoint_bytes = max_checkpoint_bytes, .stack = try Stacks.init(a, max_entries) };
    }
    pub fn deinit(self: *History) void {
        self.stack.deinit();
        self.* = undefined;
    }
    fn bind(self: *const History, session: *edit.Session) !void {
        if (self.owner != session) return error.SourceBindingMismatch;
    }
    pub fn apply(self: *History, session: *edit.Session, command: edit.Command) !bool {
        try self.bind(session);
        const before = try session.createCheckpoint(self.max_checkpoint_bytes);
        var transferred = false;
        defer if (!transferred) before.deinit();
        try self.stack.prepare();
        if (!try session.applyCheckpointed(before, self.max_checkpoint_bytes, command)) return false;
        self.stack.commit(before);
        transferred = true;
        return true;
    }
    pub fn undo(self: *History, session: *edit.Session) !bool {
        try self.bind(session);
        return self.stack.move(false, session, exchange);
    }
    pub fn redo(self: *History, session: *edit.Session) !bool {
        try self.bind(session);
        return self.stack.move(true, session, exchange);
    }
};
fn release(checkpoint: **edit.Checkpoint) void {
    checkpoint.*.deinit();
}
fn exchange(checkpoint: **edit.Checkpoint, session: *edit.Session) !void {
    try session.restoreCheckpoint(checkpoint.*);
}
