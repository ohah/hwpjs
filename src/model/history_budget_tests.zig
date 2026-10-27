const std = @import("std");
const policy = @import("history_policy.zig");
const owned = @import("history_owned_entry.zig");
const E = owned.Entry([]u8, struct {
    fn drop(_: *[]u8) void {}
}.drop);
const S = @import("history_budget_stack.zig").Stack(E);
fn capture(a: std.mem.Allocator, p: policy.Policy, text: []const u8) !*E {
    if (text.len > p.max_checkpoint_bytes) return error.HistoryCheckpointPayloadLimitExceeded;
    const e = try E.create(a, p.max_retained_bytes, p.max_checkpoint_owned_bytes);
    errdefer e.deinit();
    const value = e.allocator().dupe(u8, text) catch |err| return e.captureError(err);
    e.finish(value, text.len);
    return e;
}
const Context = struct { a: std.mem.Allocator, text: []u8 };
fn restore(e: *const E, c: *Context) !void {
    const next = try c.a.dupe(u8, e.value);
    c.a.free(c.text);
    c.text = next;
}
fn append(s: *S, c: *Context, byte: u8) !void {
    try s.prepare();
    const rollback = try c.a.dupe(u8, c.text);
    var rollback_owned = true;
    defer if (rollback_owned) c.a.free(rollback);
    const next = try c.a.alloc(u8, c.text.len + 1);
    @memcpy(next[0..c.text.len], c.text);
    next[c.text.len] = byte;
    c.a.free(c.text);
    c.text = next;
    errdefer {
        c.a.free(c.text);
        c.text = rollback;
        rollback_owned = false;
    }
    const pending = try capture(c.a, s.policy, c.text);
    var pending_owned = true;
    defer if (pending_owned) pending.deinit();
    try s.commit(try s.plan(pending));
    pending_owned = false;
}
test "owned-v2 native defaults JSON and strict invalid fields retain payload semantics" {
    const a = std.testing.allocator;
    const d = try policy.resolve(try policy.parse(a, "{}"));
    try std.testing.expectEqual(policy.default_entries, d.max_entries);
    try std.testing.expectEqual(policy.default_payload, d.max_checkpoint_bytes);
    try std.testing.expect(d.max_checkpoint_owned_bytes == null);
    for ([_][]const u8{ "[]", "null", "{\"maxEntries\":0}", "{\"maxEntries\":-1}", "{\"maxEntries\":1.0}", "{\"maxEntries\":true}", "{\"maxEntries\":null}", "{\"other\":1}", "{\"maxEntries\":1,\"maxEntries\":2}", "{\"maxRetainedBytes\":4294967296}" }) |bytes| try std.testing.expectError(error.InvalidHistoryOptions, policy.parse(a, bytes));
}
test "owned-v2 100 individual input and 100 undo return first state without pin or coalescing" {
    const a = std.testing.allocator;
    const p = try policy.resolve(.{});
    var c: Context = .{ .a = a, .text = try a.dupe(u8, "base") };
    defer a.free(c.text);
    const first = try capture(a, p, c.text);
    const s = S.create(a, p, first) catch |err| {
        first.deinit();
        return err;
    };
    defer s.deinit();
    for (0..100) |i| {
        try append(s, &c, @intCast('a' + i % 26));
        try std.testing.expectEqual(i + 1, s.undo_len);
        try std.testing.expectEqual(i + 1, s.current.revision);
    }
    const retained = s.retained_bytes;
    for (0..100) |i| {
        try std.testing.expect(try s.move(false, &c, restore));
        try std.testing.expectEqual(@as(usize, 103) - i, c.text.len);
        try std.testing.expectEqual(retained, s.retained_bytes);
    }
    try std.testing.expectEqualStrings("base", c.text);
    try std.testing.expectEqual(@as(u32, 0), s.current.revision);
    try std.testing.expect(!try s.move(false, &c, restore));
    for (0..100) |_| try std.testing.expect(try s.move(true, &c, restore));
    try std.testing.expectEqual(@as(usize, 104), c.text.len);
}
test "owned-v2 entry-count eviction loses initial revision and preserves individual steps" {
    const a = std.testing.allocator;
    const p = try policy.resolve(.{ .max_entries = 3 });
    var c: Context = .{ .a = a, .text = try a.dupe(u8, "") };
    defer a.free(c.text);
    const first = try capture(a, p, c.text);
    const s = S.create(a, p, first) catch |err| {
        first.deinit();
        return err;
    };
    defer s.deinit();
    for (0..10) |_| try append(s, &c, 'a');
    try std.testing.expectEqual(@as(u32, 7), s.oldestAvailableRevision());
    try std.testing.expectEqual(@as(usize, 7), s.evicted);
    for (0..3) |_| try std.testing.expect(try s.move(false, &c, restore));
    try std.testing.expectEqual(@as(usize, 7), c.text.len);
    try std.testing.expect(!try s.move(false, &c, restore));
}
test "owned-v2 branch clears redo only after successful commit and revision IDs stay monotonic" {
    const a = std.testing.allocator;
    const p = try policy.resolve(.{});
    var c: Context = .{ .a = a, .text = try a.dupe(u8, "") };
    defer a.free(c.text);
    const first = try capture(a, p, c.text);
    const s = S.create(a, p, first) catch |err| {
        first.deinit();
        return err;
    };
    defer s.deinit();
    try append(s, &c, 'a');
    try append(s, &c, 'b');
    _ = try s.move(false, &c, restore);
    try append(s, &c, 'z');
    try std.testing.expectEqualStrings("az", c.text);
    try std.testing.expectEqual(@as(u32, 3), s.current.revision);
    try std.testing.expectEqual(@as(usize, 0), s.redo_len);
    s.next_revision = std.math.maxInt(u32);
    try std.testing.expectError(error.HistoryRevisionExhausted, append(s, &c, 'q'));
    try std.testing.expectEqualStrings("az", c.text);
}
test "owned-v2 explicit owned 8MiB may reject but default does not shrink legacy payload 8MiB" {
    const a = std.testing.allocator;
    const p = try policy.resolve(.{});
    const bytes = try a.alloc(u8, policy.default_payload);
    defer a.free(bytes);
    @memset(bytes, 'x');
    const e = try capture(a, p, bytes);
    defer e.deinit();
    try std.testing.expect(e.ownedBytes() > policy.default_payload);
    const explicit = try policy.resolve(.{ .max_checkpoint_owned_bytes = policy.default_payload });
    try std.testing.expectError(error.HistoryEntryOwnedLimitExceeded, capture(a, explicit, bytes));
}
fn failureCase(a: std.mem.Allocator) !void {
    const p = try policy.resolve(.{ .max_entries = 4 });
    var c: Context = .{ .a = a, .text = try a.dupe(u8, "base") };
    defer a.free(c.text);
    const first = try capture(a, p, c.text);
    const s = S.create(a, p, first) catch |err| {
        first.deinit();
        return err;
    };
    defer s.deinit();
    try append(s, &c, 'a');
    try append(s, &c, 'b');
    _ = try s.move(false, &c, restore);
    const before = try a.dupe(u8, c.text);
    defer a.free(before);
    const revision = s.current.revision;
    const redo = s.redo_len;
    const retained = s.retained_bytes;
    append(s, &c, 'z') catch |err| {
        try std.testing.expectEqualSlices(u8, before, c.text);
        try std.testing.expectEqual(revision, s.current.revision);
        try std.testing.expectEqual(redo, s.redo_len);
        try std.testing.expectEqual(retained, s.retained_bytes);
        return err;
    };
    try std.testing.expectEqualStrings("baseaz", c.text);
}
test "owned-v2 all allocation failures keep model redo revision and ownership atomic" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, failureCase, .{});
}
test "legacy V1 stack untouched" {
    _ = @import("history_stack.zig");
}

test "owned-v2 rejects retained current undo redo and foreign entries without ownership transfer" {
    const a = std.testing.allocator;
    const p = try policy.resolve(.{});
    var c: Context = .{ .a = a, .text = try a.dupe(u8, "base") };
    defer a.free(c.text);
    const first = try capture(a, p, c.text);
    const s = S.create(a, p, first) catch |err| {
        first.deinit();
        return err;
    };
    defer s.deinit();
    try append(s, &c, 'a');
    try append(s, &c, 'b');
    try std.testing.expectError(error.CheckpointAlreadyRetained, s.plan(s.current));
    try std.testing.expectError(error.CheckpointAlreadyRetained, s.plan(s.undoAt(0).?));
    _ = try s.move(false, &c, restore);
    const retained = s.retained_bytes;
    try std.testing.expectError(error.CheckpointAlreadyRetained, s.plan(s.redoAt(0).?));
    try std.testing.expectError(error.CheckpointAlreadyRetained, S.create(a, p, s.current));
    const other_first = try capture(a, p, "other");
    const other = S.create(a, p, other_first) catch |err| {
        other_first.deinit();
        return err;
    };
    defer other.deinit();
    try std.testing.expectError(error.CheckpointAlreadyRetained, s.plan(other.current));
    try std.testing.expectEqual(retained, s.retained_bytes);
    try std.testing.expectEqualStrings("basea", c.text);
    try std.testing.expect(try s.move(true, &c, restore));
    try std.testing.expectEqualStrings("baseab", c.text);
}
