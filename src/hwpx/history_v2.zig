const std = @import("std");
const editor = @import("editor_session.zig");
const cp = @import("editor_checkpoint.zig");
const legacy = @import("editor_history.zig");
pub const Adapter = struct {
    pub const Session = editor.Session;
    pub const Snapshot = cp.Checkpoint;
    pub const Command = legacy.Command;
    pub fn dispose(v: *Snapshot) void {
        v.deinit();
    }
    pub fn payloadCost(s: *Session, limit: usize) !usize {
        return cp.size(s, limit);
    }
    pub fn capture(a: std.mem.Allocator, s: *Session, limit: usize) !Snapshot {
        var view = s.*;
        view.allocator = a;
        return cp.capture(&view, limit);
    }
    pub fn cloneForRestore(v: *const Snapshot, s: *Session, limit: usize) !Snapshot {
        return cp.cloneForRestore(v, s, limit);
    }
    pub fn matches(v: *const Snapshot, s: *Session, limit: usize) !bool {
        return cp.matches(v, s, limit);
    }
    pub fn apply(s: *Session, _: *Snapshot, commands: []const Command, limit: usize) !bool {
        return legacy.History.applyCommandsUnchecked(s, commands, limit);
    }
    pub fn exchange(s: *Session, v: *Snapshot) !void {
        try v.exchange(s);
    }
    pub fn rollback(s: *Session, v: *Snapshot) !void {
        try v.rollback(s);
    }
};
pub const History = @import("../model/history_owned_format.zig").History(Adapter);
