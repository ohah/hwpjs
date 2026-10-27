const std = @import("std");
const policy = @import("history_policy.zig");
const E = @import("history_stack_ssot_test_entry.zig").Entry;
const Restore = @import("history_stack_ssot_test_entry.zig").Restore;
const S = @import("history_budget_stack.zig").Stack(E);

fn append(s: *S, n: usize) !void {
    const e = try E.create(s.allocator, n);
    var owned = true;
    defer if (owned) e.deinit();
    const read_only: *const S = s;
    try s.commit(try read_only.plan(e));
    owned = false;
}

test "stack ssot const plan compatibility and counted metadata are exact" {
    const a = std.testing.allocator;
    const p = try policy.resolve(.{ .max_entries = 3 });
    const e = try E.create(a, 4);
    const s = S.createWithMetadata(a, p, e, 27) catch |err| {
        e.deinit();
        return err;
    };
    defer s.deinit();
    try std.testing.expectEqual(@sizeOf(S) + 6 * @sizeOf(*E) + 27, s.metadata_bytes);
    try append(s, 5);
    try std.testing.expectEqual(s.metadata_bytes + e.ownedBytes() + s.current.ownedBytes(), s.retained_bytes);
    try std.testing.expectEqual(s.retained_bytes, s.recount());
}

test "stack ssot ring wrap branch keeps source revisions and oldest endpoint" {
    const a = std.testing.allocator;
    for ([_]u32{ 1, 2, 3 }) |capacity| {
        const e = try E.create(a, 0);
        const s = S.create(a, try policy.resolve(.{ .max_entries = capacity }), e) catch |err| {
            e.deinit();
            return err;
        };
        defer s.deinit();
        for (0..12) |_| try append(s, 1);
        try std.testing.expectEqual(@as(u32, 12) - capacity, s.oldestAvailableRevision());
        var restore: Restore = .{};
        for (0..capacity) |_| try std.testing.expect(try s.move(false, &restore, Restore.apply));
        try std.testing.expect(!try s.move(false, &restore, Restore.apply));
        try std.testing.expectEqual(@as(u32, 12) - capacity, s.current.revision);
        try append(s, 2);
        try std.testing.expectEqual(@as(u32, 13), s.current.revision);
        try std.testing.expectEqual(@as(usize, 0), s.redo_len);
        try std.testing.expect(!try s.move(true, &restore, Restore.apply));
        try std.testing.expectEqual(s.retained_bytes, s.recount());
    }
}

test "stack ssot invalid next precedence and stale plans preserve retained authority" {
    const a = std.testing.allocator;
    const e = try E.create(a, 1);
    const s = S.create(a, try policy.resolve(.{}), e) catch |err| {
        e.deinit();
        return err;
    };
    defer s.deinit();
    const next = try E.create(a, 2);
    defer if (next.retained_by == null) next.deinit();
    const old = try s.plan(next);
    next.ready = false;
    try std.testing.expectError(error.InvalidCheckpoint, s.plan(next));
    next.ready = true;
    const retained = s.retained_bytes;
    s.epoch += 1;
    try std.testing.expectError(error.StaleHistoryPlan, s.commit(old));
    try std.testing.expectEqual(retained, s.retained_bytes);
    try std.testing.expect(s.current == e and next.retained_by == null);
    s.next_revision = std.math.maxInt(u32);
    next.ready = false;
    try std.testing.expectError(error.HistoryRevisionExhausted, s.plan(next));
}

test "stack ssot failed restore keeps all queues counts epoch and retained totals" {
    const a = std.testing.allocator;
    const e = try E.create(a, 1);
    const s = S.create(a, try policy.resolve(.{}), e) catch |err| {
        e.deinit();
        return err;
    };
    defer s.deinit();
    try append(s, 2);
    const current = s.current;
    const epoch = s.epoch;
    const retained = s.retained_bytes;
    var restore: Restore = .{ .fail = true };
    try std.testing.expectError(error.OutOfMemory, s.move(false, &restore, Restore.apply));
    try std.testing.expect(s.current == current);
    try std.testing.expectEqual(epoch, s.epoch);
    try std.testing.expectEqual(retained, s.retained_bytes);
    try std.testing.expectEqual(@as(usize, 1), s.undo_len);
    try std.testing.expectEqual(@as(usize, 0), s.redo_len);
    restore.fail = false;
    try std.testing.expect(try s.move(false, &restore, Restore.apply));
    try std.testing.expectEqual(@as(u32, 0), s.current.revision);
}

test "stack ssot immediate undo retained cap rejects without changing redo" {
    const a = std.testing.allocator;
    const cap = @sizeOf(S) + 4 * @sizeOf(*E) + 2 * (@sizeOf(E) + 1);
    const p = try policy.resolve(.{ .max_entries = 2, .max_retained_bytes = @intCast(cap) });
    const e = try E.create(a, 1);
    const s = S.create(a, p, e) catch |err| {
        e.deinit();
        return err;
    };
    defer s.deinit();
    try append(s, 1);
    var restore: Restore = .{};
    _ = try s.move(false, &restore, Restore.apply);
    const next = try E.create(a, 2);
    defer next.deinit();
    const before = s.retained_bytes;
    try std.testing.expectError(error.HistoryRetainedLimitExceeded, s.plan(next));
    try std.testing.expectEqual(before, s.retained_bytes);
    try std.testing.expectEqual(@as(usize, 1), s.redo_len);
    try std.testing.expect(next.retained_by == null);
}

test "stack ssot constant stats do not recount and preserve Native wire fields" {
    const a = std.testing.allocator;
    const e = try E.create(a, 3);
    const s = S.create(a, try policy.resolve(.{}), e) catch |err| {
        e.deinit();
        return err;
    };
    defer s.deinit();
    try append(s, 4);
    var restore: Restore = .{};
    _ = try s.move(false, &restore, Restore.apply);
    const h = .{ .stack = s, .requested = policy.Options{}, .poisoned = true };
    const before = s.counters.recount_calls;
    const stats = @import("history_stats.zig").v2(h);
    try std.testing.expectEqual(@as(u32, 2), stats.protocolVersion);
    try std.testing.expect(stats.poisoned);
    try std.testing.expectEqual(before, s.counters.recount_calls);
    try std.testing.expectEqual(s.retained_bytes, stats.retainedBytes.?);
    try std.testing.expectEqual(s.redo.owned_bytes, stats.redoOwnedBytes.?);
    try std.testing.expectEqual(@as(usize, 0), stats.undoOwnedBytes.?);
}

test "stack ssot n 2n 4n owned cost calls stay linear without shifts or recount" {
    const a = std.testing.allocator;
    for ([_]usize{ 32, 64, 128 }) |n| {
        var calls: usize = 0;
        const e = try E.create(a, 1);
        e.cost_calls = &calls;
        const s = S.create(a, try policy.resolve(.{ .max_entries = 256 }), e) catch |err| {
            e.deinit();
            return err;
        };
        defer s.deinit();
        calls = 0;
        for (0..n) |_| {
            const next = try E.create(a, 1);
            next.cost_calls = &calls;
            var owned = true;
            defer if (owned) next.deinit();
            try s.commit(try s.plan(next));
            owned = false;
        }
        try std.testing.expect(calls <= 16 * n);
        try std.testing.expectEqual(@as(usize, 0), s.counters.shifted_entry_slots);
        try std.testing.expectEqual(@as(usize, 0), s.counters.recount_calls);
        std.debug.print("SSOT n={d} ownedCostCalls={d} shifts={d} recount={d}\n", .{ n, calls, s.counters.shifted_entry_slots, s.counters.recount_calls });
    }
}
