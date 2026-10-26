const std = @import("std");
const edit = @import("style_preservation.zig");
pub const Adapter = struct {
    pub const Session = edit.Session;
    pub const Snapshot = *edit.Checkpoint;
    pub const Command = edit.Command;
    pub fn dispose(v: *Snapshot) void {
        v.*.deinit();
    }
    pub fn payloadCost(s: *Session, limit: usize) !usize {
        return s.checkpointSize(limit);
    }
    pub fn capture(a: std.mem.Allocator, s: *Session, limit: usize) !Snapshot {
        return s.createHistoryCheckpointIn(a, limit);
    }
    pub fn cloneForRestore(v: *const Snapshot, s: *Session, limit: usize) !Snapshot {
        return s.cloneHistoryCheckpointForRestore(v.*, limit);
    }
    pub fn matches(v: *const Snapshot, s: *Session, limit: usize) !bool {
        // Existing equality binds allocator+owner; compare a Parent clone, never exchange arena values.
        const parent = try s.cloneHistoryCheckpointForRestore(v.*, limit);
        defer parent.deinit();
        return s.matchesCheckpoint(parent);
    }
    pub fn apply(s: *Session, before: *Snapshot, commands: []const Command, limit: usize) !bool {
        for (commands) |command| try s.apply(command);
        if (try s.matchesCheckpoint(before.*)) return false;
        _ = try s.checkpointSize(limit);
        return true;
    }
    pub fn exchange(s: *Session, v: *Snapshot) !void {
        try s.restoreCheckpoint(v.*);
    }
    pub fn rollback(s: *Session, v: *Snapshot) !void {
        try s.rollbackHistoryCheckpoint(v.*);
    }
};
pub const History = @import("../../model/history_owned_format.zig").History(Adapter);
