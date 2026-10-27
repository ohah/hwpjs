const std = @import("std");
const editor = @import("../hwpx/editor_session.zig");
const v2 = @import("../hwpx/history_v2.zig");
test "FORMAT-V2 HWPX actual ZIP 100 individual edits undo redo exact initial save" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const h = try v2.History.create(a, &s, .{});
    defer h.deinit();
    for (0..100) |i| {
        try std.testing.expect(try h.applyBatch(&s, &.{.{ .kind = .anchored, .paragraph = 1, .start = @intCast(i), .deleted = 0, .inserted = "x" }}));
        try std.testing.expectEqual(i + 1, h.stack.current.revision);
        try std.testing.expectEqual(i + 1, h.stack.undo_len);
    }
    const edited = try s.save();
    defer a.free(edited);
    try output("shapeline-edited.hwpx", edited);
    var edited_open = try editor.open(a, edited, .{});
    defer edited_open.deinit();
    const retained = h.stack.retained_bytes;
    for (0..100) |_| {
        try std.testing.expect(try h.undo(&s));
        try std.testing.expectEqual(retained, h.stack.retained_bytes);
    }
    try std.testing.expectEqual(@as(u32, 0), h.stack.current.revision);
    try std.testing.expect(!try h.undo(&s));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try output("shapeline-restored.hwpx", restored);
    for (0..100) |_| try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
}

/// Evidence export is opt-in. All inline model/save comparisons run either way.
fn output(comptime name: []const u8, bytes: []const u8) !void {
    var sink = (@import("evidence_output.zig").Sink.fromEnviron(std.testing.allocator, std.testing.io, std.testing.environ, "HWPJS_HISTORY_EVIDENCE_DIR") catch |err| switch (err) {
        error.InvalidEvidenceDirectory => return error.InvalidHistoryEvidenceDirectory,
        else => return err,
    }) orelse return;
    defer sink.deinit();
    try sink.writeFile(name, bytes);
}

test "FORMAT-V2 HWPX late second-command failure rolls back once and preserves redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const h = try v2.History.create(a, &s, .{});
    defer h.deinit();
    const cmd: v2.Adapter.Command = .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" };
    _ = try h.applyBatch(&s, &.{cmd});
    _ = try h.undo(&s);
    const bytes = h.stack.retained_bytes;
    try std.testing.expectError(error.InvalidSectionIndex, h.applyBatch(&s, &.{ cmd, .{ .section = 999, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "bad" } }));
    try std.testing.expectEqual(@as(u32, 0), h.stack.current.revision);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo_len);
    try std.testing.expectEqual(bytes, h.stack.retained_bytes);
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(try h.redo(&s));
}
test "FORMAT-V2 HWPX owned limit late capture rollback preserves redo and original ZIP" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const h = try v2.History.create(a, &s, .{});
    defer h.deinit();
    _ = try h.applyBatch(&s, &.{.{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" }});
    _ = try h.undo(&s);
    h.stack.policy.max_checkpoint_owned_bytes = @intCast(h.stack.current.ownedBytes());
    const huge = try a.alloc(u8, 20000);
    defer a.free(huge);
    @memset(huge, 'x');
    try std.testing.expectError(error.HistoryEntryOwnedLimitExceeded, h.applyBatch(&s, &.{.{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = huge }}));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo_len);
    try std.testing.expect(!h.poisoned);
}
test "FORMAT-V2 HWPX direct mutation rejected before undo or next edit" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const h = try v2.History.create(a, &s, .{});
    defer h.deinit();
    const cmd: v2.Adapter.Command = .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" };
    _ = try h.applyBatch(&s, &.{cmd});
    _ = try s.spliceAnchored(0, 1, 0, 0, "external");
    try std.testing.expectError(error.HistoryCurrentMismatch, h.undo(&s));
    try std.testing.expectError(error.HistoryCurrentMismatch, h.applyBatch(&s, &.{cmd}));
    try std.testing.expectEqual(@as(u32, 1), h.stack.current.revision);
}

const FaultAdapter = struct {
    pub const Session = v2.Adapter.Session;
    pub const Snapshot = v2.Adapter.Snapshot;
    pub const Command = v2.Adapter.Command;
    pub const dispose = v2.Adapter.dispose;
    pub const payloadCost = v2.Adapter.payloadCost;
    pub const capture = v2.Adapter.capture;
    pub const cloneForRestore = v2.Adapter.cloneForRestore;
    pub const matches = v2.Adapter.matches;
    pub const exchange = v2.Adapter.exchange;
    var failure_allocator: ?*std.testing.FailingAllocator = null;
    var rollback_failure: bool = false;
    pub fn apply(s: *Session, before: *Snapshot, commands: []const Command, limit: usize) !bool {
        const changed = try v2.Adapter.apply(s, before, commands, limit);
        if (failure_allocator) |fa| fa.fail_index = fa.alloc_index;
        return changed;
    }
    pub fn rollback(s: *Session, before: *Snapshot) !void {
        if (rollback_failure) return error.InjectedRollbackFailure;
        try v2.Adapter.rollback(s, before);
    }
};
test "FORMAT-V2 HWPX real post-mutation backing OOM rolls back and failed rollback poisons" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var fa = std.testing.FailingAllocator.init(a, .{});
    const f = fa.allocator();
    var s = try editor.open(f, input, .{});
    defer s.deinit();
    const H = @import("../model/history_owned_format.zig").History(FaultAdapter);
    const h = try H.create(f, &s, .{});
    defer h.deinit();
    const cmd: v2.Adapter.Command = .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" };
    _ = try h.applyBatch(&s, &.{cmd});
    _ = try h.undo(&s);
    FaultAdapter.failure_allocator = &fa;
    defer FaultAdapter.failure_allocator = null;
    try std.testing.expectError(error.OutOfMemory, h.applyBatch(&s, &.{cmd}));
    fa.fail_index = std.math.maxInt(usize);
    const saved = try s.save();
    defer f.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo_len);
    try std.testing.expect(!h.poisoned);
    FaultAdapter.rollback_failure = true;
    defer FaultAdapter.rollback_failure = false;
    try std.testing.expectError(error.MutationUncertain, h.applyBatch(&s, &.{cmd}));
    fa.fail_index = std.math.maxInt(usize);
    try std.testing.expect(h.poisoned);
    try std.testing.expectError(error.HistoryMutationUncertain, h.undo(&s));
    try std.testing.expectError(error.HistoryMutationUncertain, h.redo(&s));
    try std.testing.expectError(error.HistoryMutationUncertain, h.applyBatch(&s, &.{cmd}));
}

const h5edit = @import("../hwp5/edit/style_preservation.zig");
const h5v2 = @import("../hwp5/edit/history_v2.zig");
fn h5save(s: *h5edit.Session) ![]u8 {
    const value = try s.save(std.testing.allocator, .{ .allow_stale_layout = true });
    return value.bytes;
}
fn h5command(i: usize) h5edit.Command {
    return .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = @intCast(i), .end_unit = @intCast(i), .utf8 = "x" } };
}
test "FORMAT-V2 HWP5 real CFB 100 individual edits undo redo initial save bytes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const s = try h5edit.Session.open(a, input);
    defer s.close();
    const h = try h5v2.History.create(a, s, .{});
    defer h.deinit();
    for (0..100) |i| {
        try std.testing.expect(try h.applyBatch(s, &.{h5command(i)}));
        try std.testing.expectEqual(i + 1, h.stack.current.revision);
        try std.testing.expectEqual(i + 1, h.stack.undo_len);
    }
    const edited = try h5save(s);
    defer a.free(edited);
    try output("charshape-edited.hwp", edited);
    const reopened = try h5edit.Session.open(a, edited);
    defer reopened.close();
    const retained = h.stack.retained_bytes;
    for (0..100) |_| {
        try std.testing.expect(try h.undo(s));
        try std.testing.expectEqual(retained, h.stack.retained_bytes);
    }
    try std.testing.expectEqual(@as(u32, 0), h.stack.current.revision);
    try std.testing.expect(!try h.undo(s));
    const restored = try h5save(s);
    defer a.free(restored);
    try output("charshape-restored.hwp", restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    for (0..100) |_| try std.testing.expect(try h.redo(s));
    const redone = try h5save(s);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
}
test "FORMAT-V2 HWP5 partial batch failure and live mismatch preserve history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const s = try h5edit.Session.open(a, input);
    defer s.close();
    const h = try h5v2.History.create(a, s, .{});
    defer h.deinit();
    _ = try h.applyBatch(s, &.{h5command(0)});
    _ = try h.undo(s);
    const bad: h5edit.Command = .{ .splice_text = .{ .section = 999, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "bad" } };
    try std.testing.expectError(error.InvalidSection, h.applyBatch(s, &.{ h5command(0), bad }));
    try std.testing.expectEqual(@as(u32, 0), h.stack.current.revision);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo_len);
    const restored = try h5save(s);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(try h.redo(s));
    try s.apply(h5command(0));
    try std.testing.expectError(error.HistoryCurrentMismatch, h.undo(s));
}

test "FORMAT-V2 real format facades Native defaults stats and V1 compatibility" {
    const a = std.testing.allocator;
    const hxbytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(hxbytes);
    var hx = try editor.open(a, hxbytes, .{});
    defer hx.deinit();
    var hxhistory = try @import("../hwpx/editor_history.zig").History.initV2(&hx, .{});
    defer hxhistory.deinit();
    _ = try hxhistory.apply(&hx, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" });
    const stats = hxhistory.stats();
    try std.testing.expectEqual(@as(u32, 2), stats.protocolVersion);
    try std.testing.expectEqual(@as(?u32, 256), stats.resolved.maxEntries);
    try std.testing.expect(stats.requested.maxEntries == null);
    try std.testing.expectEqual(stats.retainedBytes.?, stats.metadataOwnedBytes.? + stats.currentOwnedBytes.? + stats.undoOwnedBytes.? + stats.redoOwnedBytes.?);
    try std.testing.expect(stats.metadataOwnedBytes.? >= @sizeOf(@TypeOf(hxhistory.owned.?.*)));
    try std.testing.expectEqual(@as(u32, 1), hxhistory.revision());
    try std.testing.expectEqual(@as(usize, 2), hxhistory.revisionCount());
    try std.testing.expect(try hxhistory.undo(&hx));
    const h5bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(h5bytes);
    const h5 = try h5edit.Session.open(a, h5bytes);
    defer h5.close();
    var history = try @import("../hwp5/edit/editor_history.zig").History.initV2(a, h5, .{});
    defer history.deinit();
    _ = try history.apply(h5, h5command(0));
    try std.testing.expectEqual(@as(u32, 2), history.stats().protocolVersion);
    try std.testing.expect(try history.undo(h5));
    var legacy = try @import("../hwp5/edit/editor_history.zig").History.init(a, h5, 16, 8 * 1024 * 1024);
    defer legacy.deinit();
    try std.testing.expectEqual(@as(u32, 1), legacy.stats().protocolVersion);
    try std.testing.expect(legacy.stats().retainedBytes == null);
    for (0..20) |i| _ = try legacy.apply(h5, h5command(i));
    for (0..16) |_| try std.testing.expect(try legacy.undo(h5));
    try std.testing.expect(!try legacy.undo(h5));
    try std.testing.expectEqual(@as(u32, 4), legacy.revision());
}
const H5FaultAdapter = struct {
    pub const Session = h5v2.Adapter.Session;
    pub const Snapshot = h5v2.Adapter.Snapshot;
    pub const Command = h5v2.Adapter.Command;
    pub const dispose = h5v2.Adapter.dispose;
    pub const payloadCost = h5v2.Adapter.payloadCost;
    pub const capture = h5v2.Adapter.capture;
    pub const cloneForRestore = h5v2.Adapter.cloneForRestore;
    pub const matches = h5v2.Adapter.matches;
    pub const exchange = h5v2.Adapter.exchange;
    pub const rollback = h5v2.Adapter.rollback;
    var failure_allocator: ?*std.testing.FailingAllocator = null;
    pub fn apply(s: *Session, before: *Snapshot, commands: []const Command, limit: usize) !bool {
        const changed = try h5v2.Adapter.apply(s, before, commands, limit);
        if (failure_allocator) |fa| fa.fail_index = fa.alloc_index;
        return changed;
    }
};
test "FORMAT-V2 HWP5 post-mutation backing OOM and late payload limit preserve original redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var fa = std.testing.FailingAllocator.init(a, .{});
    const f = fa.allocator();
    const s = try h5edit.Session.open(f, input);
    defer s.close();
    const H = @import("../model/history_owned_format.zig").History(H5FaultAdapter);
    const h = try H.create(f, s, .{});
    defer h.deinit();
    _ = try h.applyBatch(s, &.{h5command(0)});
    _ = try h.undo(s);
    H5FaultAdapter.failure_allocator = &fa;
    defer H5FaultAdapter.failure_allocator = null;
    try std.testing.expectError(error.OutOfMemory, h.applyBatch(s, &.{h5command(0)}));
    fa.fail_index = std.math.maxInt(usize);
    H5FaultAdapter.failure_allocator = null;
    const saved = try h5save(s);
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo_len);
    try std.testing.expect(!h.poisoned);
    h.stack.policy.max_checkpoint_bytes = @intCast(try s.checkpointSize(std.math.maxInt(usize)));
    try std.testing.expectError(error.LimitExceeded, h.applyBatch(s, &.{h5command(0)}));
    const restored = try h5save(s);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo_len);
}
