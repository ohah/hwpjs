//! HWP5 adapter: current native values are authoritative, never saved HWP bytes.
const std = @import("std");
const edit = @import("style_preservation.zig");
const Stacks = @import("../../model/history_stack.zig").Stack(*edit.Checkpoint, release);

pub const History = struct {
    owner: *edit.Session,
    max_checkpoint_bytes: usize,
    stack: Stacks,
    owned: ?*@import("history_v2.zig").History = null,

    pub fn init(a: std.mem.Allocator, session: *edit.Session, max_entries: usize, max_checkpoint_bytes: usize) !History {
        if (max_checkpoint_bytes == 0) return error.LimitExceeded;
        _ = std.math.mul(usize, max_entries, max_checkpoint_bytes) catch return error.LimitExceeded;
        return .{ .owner = session, .max_checkpoint_bytes = max_checkpoint_bytes, .stack = try Stacks.init(a, max_entries) };
    }
    pub fn initV2(a: std.mem.Allocator, session: *edit.Session, options: @import("../../model/history_policy.zig").Options) !History {
        const value = try @import("history_v2.zig").History.create(a, session, options);
        errdefer value.deinit();
        return .{ .owner = session, .max_checkpoint_bytes = value.stack.policy.max_checkpoint_bytes, .stack = try Stacks.init(a, 1), .owned = value };
    }
    pub fn revision(self: *const History) u32 {
        return if (self.owned) |h| h.stack.current.revision else self.stack.revision;
    }
    pub fn revisionCount(self: *const History) usize {
        return if (self.owned) |h| h.stack.revisionCount() else self.stack.revisionCount();
    }
    pub fn revisionAt(self: *const History, index: usize) ?u32 {
        return if (self.owned) |h| h.stack.revisionAt(index) else self.stack.revisionAt(index);
    }
    pub fn stats(self: *const History) @import("../../model/history_stats.zig").Stats {
        const wire = @import("../../model/history_stats.zig");
        return if (self.owned) |h| wire.v2(h) else wire.v1(self);
    }
    pub fn deinit(self: *History) void {
        if (self.owned) |h| h.deinit();
        self.stack.deinit();
        self.* = undefined;
    }
    fn bind(self: *const History, session: *edit.Session) !void {
        if (self.owner != session) return error.SourceBindingMismatch;
    }
    pub fn apply(self: *History, session: *edit.Session, command: edit.Command) !bool {
        return self.applyBatch(session, &.{command});
    }
    pub fn applyBatch(self: *History, session: *edit.Session, commands: []const edit.Command) !bool {
        if (self.owned) |h| return h.applyBatch(session, commands);
        try self.bind(session);
        const before = try session.createCheckpoint(self.max_checkpoint_bytes);
        var transferred = false;
        defer if (!transferred) before.deinit();
        try self.stack.prepare();
        if (!try session.applyBatchCheckpointed(before, self.max_checkpoint_bytes, commands)) return false;
        self.stack.commit(before);
        transferred = true;
        return true;
    }
    pub fn undo(self: *History, session: *edit.Session) !bool {
        if (self.owned) |h| return h.undo(session);
        try self.bind(session);
        return self.stack.move(false, session, exchange);
    }
    pub fn redo(self: *History, session: *edit.Session) !bool {
        if (self.owned) |h| return h.redo(session);
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
