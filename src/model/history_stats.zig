//! Retained allocation requests, not RSS/usable malloc bytes or transient restore clones.
const policy = @import("history_policy.zig");
pub const Policy = struct {
    maxEntries: ?u32 = null,
    maxCheckpointBytes: ?u32 = null,
    maxCheckpointOwnedBytes: ?u32 = null,
    maxRetainedBytes: ?u32 = null,
};
pub const Stats = struct {
    protocolVersion: u32,
    requested: Policy,
    resolved: Policy,
    revision: u32,
    oldestAvailableRevision: u32,
    undoCount: usize,
    redoCount: usize,
    retainedBytes: ?usize,
    metadataOwnedBytes: ?usize,
    currentOwnedBytes: ?usize,
    undoOwnedBytes: ?usize,
    redoOwnedBytes: ?usize,
    evictedCount: ?usize,
    poisoned: bool,
};
fn wire(o: policy.Options) Policy {
    return .{ .maxEntries = o.max_entries, .maxCheckpointBytes = o.max_checkpoint_bytes, .maxCheckpointOwnedBytes = o.max_checkpoint_owned_bytes, .maxRetainedBytes = o.max_retained_bytes };
}
pub fn v2(h: anytype) Stats {
    const s = h.stack;
    var undo: usize = 0;
    var redo: usize = 0;
    for (s.undo_slots[0..s.undo_len]) |e| undo += e.ownedBytes();
    for (s.redo_slots[0..s.redo_len]) |e| redo += e.ownedBytes();
    return .{ .protocolVersion = 2, .requested = wire(h.requested), .resolved = wire(.{ .max_entries = s.policy.max_entries, .max_checkpoint_bytes = s.policy.max_checkpoint_bytes, .max_checkpoint_owned_bytes = s.policy.max_checkpoint_owned_bytes, .max_retained_bytes = s.policy.max_retained_bytes }), .revision = s.current.revision, .oldestAvailableRevision = s.oldestAvailableRevision(), .undoCount = s.undo_len, .redoCount = s.redo_len, .retainedBytes = s.retained_bytes, .metadataOwnedBytes = s.metadata_bytes, .currentOwnedBytes = s.current.ownedBytes(), .undoOwnedBytes = undo, .redoOwnedBytes = redo, .evictedCount = s.evicted, .poisoned = h.poisoned };
}
pub fn v1(h: anytype) Stats {
    const s = &h.stack;
    var oldest = s.revision;
    for (0..s.revisionCount()) |i| oldest = @min(oldest, s.revisionAt(i).?);
    const p: Policy = .{ .maxEntries = @intCast(s.max_entries), .maxCheckpointBytes = @intCast(h.max_checkpoint_bytes) };
    return .{ .protocolVersion = 1, .requested = p, .resolved = p, .revision = s.revision, .oldestAvailableRevision = oldest, .undoCount = s.undo.items.len, .redoCount = s.redo.items.len, .retainedBytes = null, .metadataOwnedBytes = null, .currentOwnedBytes = null, .undoOwnedBytes = null, .redoOwnedBytes = null, .evictedCount = null, .poisoned = false };
}
