// Focused reservation/accounting and the unchanged resource-history regression.
const std = @import("std");
const editor = @import("hwpx/editor_session.zig");
const cp = @import("hwpx/editor_checkpoint.zig");
const commands = @import("hwpx/editor_history.zig");
const History = commands.History;
const proof = @import("hwpx/display_resource_generation.zig");
const reserve = @import("hwpx/history_metadata_reservation.zig");
const a = std.testing.allocator;
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>abc</p:t></p:run></p:p></s:sec>";
test {
    _ = @import("hwpx/display_resource_generation_tests.zig");
    _ = @import("model/history_budget_tests.zig");
}
fn fixture() ![]u8 {
    return @import("hwpx/test_formula_fixture.zig").zipWithSection(a, xml);
}
fn pinnedNoori() ![]u8 {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(4_000_000));
    errdefer a.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    const hex = std.fmt.bytesToHex(digest, .lower);
    try std.testing.expectEqualStrings("6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab", &hex);
    return bytes;
}
fn append(s: *editor.Session, h: *History, unit: u32, value: []const u8) !void {
    try std.testing.expect(try h.apply(s, .{ .section = 0, .paragraph = 1, .start = unit, .deleted = 0, .inserted = value }));
}
fn accounting(h: *History) !void {
    const v = h.owned.?;
    const s = v.stack;
    const metadata = @sizeOf(@TypeOf(s.*)) + @sizeOf(@TypeOf(v.*)) + (s.undo.slots.len + s.redo.slots.len) * @sizeOf(@TypeOf(s.current));
    try std.testing.expectEqual(metadata, s.metadata_bytes);
    try std.testing.expectEqual(s.recount(), h.stats().retainedBytes.?);
    try std.testing.expect(h.stats().retainedBytes.? <= s.policy.max_retained_bytes);
    try std.testing.expect(s.undo.slots.ptr != s.redo.slots.ptr);
    try std.testing.expect(s.undo.len + s.redo.len <= s.undo.slots.len);
}

test "history reservation capacity upper bound never changes requested policy" {
    try std.testing.expectEqual(@as(usize, 81), reserve.capacity(256, 88662, 1072));
    try std.testing.expectEqual(@as(usize, 245), reserve.capacity(256, 88662, 360));
    for ([_]usize{ 1, 360, 1072, 4096 }) |minimum| {
        for ([_]u32{ 1, 360, 1000, 88662, 128 * 1024 * 1024 }) |limit| {
            for ([_]u32{ 1, 3, 256, 65535 }) |max| {
                const slots = reserve.capacity(max, limit, minimum);
                try std.testing.expect(slots > 0 and slots <= max);
                const possible = (@as(usize, limit) / minimum) -| 1;
                try std.testing.expect(slots >= @min(max, possible));
            }
        }
    }
}
test "history reservation pinned 88662 actual allocations keep both full formatting undos" {
    const bytes = try pinnedNoori();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    var h = try History.initV2(&s, .{ .max_retained_bytes = 88662 });
    defer h.deinit();
    const generation = s.display_resource_generation;
    try std.testing.expect(!h.owned.?.managed);
    try std.testing.expectEqual(@as(u32, 256), h.stats().resolved.maxEntries.?);
    try std.testing.expectEqual(@as(u32, 88662), h.stats().resolved.maxRetainedBytes.?);
    const old_metadata = @sizeOf(@TypeOf(h.owned.?.*)) + @sizeOf(@TypeOf(h.owned.?.stack.*)) + 256 * 2 * @sizeOf(@TypeOf(h.owned.?.stack.current));
    try std.testing.expect(try h.apply(&s, .{ .kind = .character_properties, .section = 0, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .bold = true, .italic = true, .size = 1800 } }));
    try std.testing.expect(try h.apply(&s, .{ .kind = .paragraph_alignment, .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "", .paragraph_alignment = .RIGHT }));
    try accounting(&h);
    const stats = h.stats();
    try std.testing.expectEqual(@as(usize, 2), stats.undoCount);
    try std.testing.expectEqual(@as(usize, 0), stats.evictedCount.?);
    // Independent requested-allocation counter, separate from the entry meter.
    var count = std.testing.FailingAllocator.init(a, .{});
    var proxy = s;
    proxy.allocator = count.allocator();
    var snapshot = try cp.capture(&proxy, 4_000_000);
    try std.testing.expectEqual(count.allocated_bytes - count.freed_bytes, h.owned.?.stack.current.meter.live);
    snapshot.deinit();
    try std.testing.expectEqual(count.allocated_bytes, count.freed_bytes);
    std.debug.print("RESERVATION_CAP slots={} requestedMax={} oldMeta={} actualMeta={} retained={} undo={} evicted={} current={} undoOwned={}\n", .{ h.owned.?.stack.undo.slots.len, stats.resolved.maxEntries.?, old_metadata, stats.metadataOwnedBytes.?, stats.retainedBytes.?, stats.undoCount, stats.evictedCount.?, stats.currentOwnedBytes.?, stats.undoOwnedBytes.? });
    const changed = try s.save();
    defer a.free(changed);
    try std.testing.expect(try h.undo(&s));
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectEqual(generation, s.display_resource_generation);
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try std.testing.expect(try h.redo(&s));
    try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
}
test "history reservation max count wrap and mixed undo redo branch keep order for both lanes" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]bool{ false, true }) |managed| {
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = managed;
        proof.openOwned(&s);
        var h = try History.initV2(&s, .{ .max_entries = 3, .max_retained_bytes = 65536 });
        defer h.deinit();
        var saves: [11][]u8 = undefined;
        var initialized: usize = 0;
        defer for (saves[0..initialized]) |saved| a.free(saved);
        saves[0] = try s.save();
        initialized = 1;
        for (0..10) |i| {
            try append(&s, &h, @intCast(3 + i), "x");
            saves[i + 1] = try s.save();
            initialized += 1;
            try accounting(&h);
        }
        try std.testing.expectEqual(@as(usize, 3), h.stats().undoCount);
        try std.testing.expectEqual(@as(usize, 7), h.stats().evictedCount.?);
        for (0..3) |i| {
            try std.testing.expect(try h.undo(&s));
            const saved = try s.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, saves[9 - i], saved);
            try accounting(&h);
        }
        try std.testing.expect(!try h.undo(&s));
        for (0..3) |i| {
            try std.testing.expect(try h.redo(&s));
            const saved = try s.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, saves[8 + i], saved);
            try accounting(&h);
        }
        try std.testing.expect(try h.undo(&s));
        try append(&s, &h, 12, "z");
        try std.testing.expect(!try h.redo(&s));
        try std.testing.expectEqualStrings("abcxxxxxxxxxz", s.sections[0].sites.items[0].text);
        try accounting(&h);
    }
}
test "history reservation byte cap evicts without physical slot overflow in both lanes" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]bool{ false, true }) |managed| {
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = managed;
        var h = try History.initV2(&s, .{ .max_entries = 65535, .max_retained_bytes = 32768 });
        defer h.deinit();
        try std.testing.expect(h.owned.?.stack.undo.slots.len < 65535);
        try std.testing.expectEqual(@as(u32, 65535), h.stats().resolved.maxEntries.?);
        for (0..96) |i| {
            try append(&s, &h, @intCast(3 + i), "x");
            try accounting(&h);
        }
        try std.testing.expect(h.stats().evictedCount.? > 0);
        const retained = h.stats().retainedBytes.?;
        while (try h.undo(&s)) try accounting(&h);
        while (try h.redo(&s)) try accounting(&h);
        try std.testing.expectEqual(retained, h.stats().retainedBytes.?);
    }
}
test "history reservation payload refusal retains bytes revision and redo" {
    const bytes = try fixture();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    const initial_payload = try cp.size(&s, std.math.maxInt(usize));
    var h = try History.initV2(&s, .{ .max_checkpoint_bytes = @intCast(initial_payload + 1), .max_retained_bytes = 65536 });
    defer h.deinit();
    try append(&s, &h, 3, "x");
    const edited = try s.save();
    defer a.free(edited);
    try std.testing.expect(try h.undo(&s));
    const before = h.stats();
    try std.testing.expectEqual(@as(usize, 1), before.redoCount);
    try std.testing.expectError(error.LimitExceeded, h.apply(&s, .{ .section = 0, .paragraph = 1, .start = 3, .deleted = 0, .inserted = "xxx" }));
    try std.testing.expectEqualDeep(before, h.stats());
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
}
const Counts = struct { calls: usize = 0, success: usize = 0, oom: usize = 0 };
fn failureCase(allocator: std.mem.Allocator, bytes: []const u8, managed: bool, counts: *Counts) !void {
    counts.calls += 1;
    var s = try editor.open(allocator, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = managed;
    var h = try History.initV2(&s, .{ .max_entries = 3, .max_retained_bytes = 65536 });
    defer h.deinit();
    const source_ptr = s.source.ptr;
    const original = h.stats();
    _ = h.apply(&s, .{ .section = 0, .paragraph = 1, .start = 3, .deleted = 0, .inserted = "x" }) catch |err| {
        try std.testing.expectEqualDeep(original, h.stats());
        try std.testing.expectEqualStrings("abc", s.sections[0].sites.items[0].text);
        return err;
    };
    const once = h.stats();
    _ = h.apply(&s, .{ .section = 0, .paragraph = 1, .start = 4, .deleted = 0, .inserted = "y" }) catch |err| {
        try std.testing.expectEqualDeep(once, h.stats());
        try std.testing.expectEqualStrings("abcx", s.sections[0].sites.items[0].text);
        return err;
    };
    const twice = h.stats();
    _ = h.undo(&s) catch |err| {
        try std.testing.expectEqualDeep(twice, h.stats());
        try std.testing.expectEqualStrings("abcxy", s.sections[0].sites.items[0].text);
        return err;
    };
    const undone = h.stats();
    _ = h.redo(&s) catch |err| {
        try std.testing.expectEqualDeep(undone, h.stats());
        try std.testing.expectEqualStrings("abcx", s.sections[0].sites.items[0].text);
        return err;
    };
    try std.testing.expectEqualStrings("abcxy", s.sections[0].sites.items[0].text);
    try std.testing.expectEqual(source_ptr, s.source.ptr);
    try std.testing.expectEqualSlices(u8, bytes, s.source);
    counts.success += 1;
}
fn countedFailureCase(allocator: std.mem.Allocator, bytes: []const u8, managed: bool, counts: *Counts) !void {
    failureCase(allocator, bytes, managed, counts) catch |err| {
        if (err == error.OutOfMemory) counts.oom += 1;
        return err;
    };
}
test "history reservation every OOM preserves ownership current revision and redo" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]bool{ false, true }) |managed| {
        var counts: Counts = .{};
        try @import("testing/allocation_failures.zig").check(countedFailureCase, .{ bytes, managed, &counts });
        try std.testing.expectEqual(@as(usize, 2), counts.success);
        try std.testing.expect(counts.oom > 10);
        std.debug.print("RESERVATION_OOM managed={} calls={} success={} oom={}\n", .{ managed, counts.calls, counts.success, counts.oom });
    }
}

const GenericEntry = @import("model/history_owned_entry.zig").Entry([]const u8, struct {
    fn release(_: *[]const u8) void {}
}.release);
const GenericStack = @import("model/history_budget_stack.zig").Stack(GenericEntry);
fn emptyEntry() !*GenericEntry {
    const entry = try GenericEntry.create(a, 65536, null);
    entry.finish("", 0);
    return entry;
}
test "history reservation generic default charges every actual metadata allocation and keeps old capacity" {
    const entry = try emptyEntry();
    var adopted = false;
    defer if (!adopted) entry.deinit();
    var counter = std.testing.FailingAllocator.init(a, .{});
    const policy = try @import("model/history_policy.zig").resolve(.{ .max_retained_bytes = 65536 });
    const stack = try GenericStack.create(counter.allocator(), policy, entry);
    adopted = true;
    defer stack.deinit();
    try std.testing.expectEqual(@as(usize, policy.max_entries), stack.undo.slots.len);
    try std.testing.expectEqual(@as(usize, policy.max_entries), stack.redo.slots.len);
    try std.testing.expectEqual(counter.allocated_bytes - counter.freed_bytes, stack.metadata_bytes);
    try std.testing.expectEqual(stack.metadata_bytes + entry.ownedBytes(), stack.retained_bytes);
}
test "history reservation invalid policy and physical capacity refuse before ownership changes" {
    const entry = try emptyEntry();
    var adopted = false;
    defer if (!adopted) entry.deinit();
    var policy = try @import("model/history_policy.zig").resolve(.{ .max_entries = 3, .max_retained_bytes = 65536 });
    policy.max_entries = 0;
    try std.testing.expectError(error.InvalidHistoryOptions, GenericStack.createWithReservedEntries(a, policy, entry, 0, 0));
    policy.max_entries = 3;
    for ([_]usize{ 0, 4 }) |bad| try std.testing.expectError(error.InvalidHistoryCapacity, GenericStack.createWithReservedEntries(a, policy, entry, 0, bad));
    try std.testing.expect(entry.retained_by == null);
    const stack = try GenericStack.createWithReservedEntries(a, policy, entry, 0, 1);
    adopted = true;
    defer stack.deinit();
    const second = try emptyEntry();
    var second_adopted = false;
    defer if (!second_adopted) second.deinit();
    try stack.commit(try stack.plan(second));
    second_adopted = true;
    const third = try emptyEntry();
    defer third.deinit();
    const retained = stack.retained_bytes;
    try std.testing.expectError(error.HistoryRetainedLimitExceeded, stack.plan(third));
    try std.testing.expectEqual(retained, stack.retained_bytes);
    try std.testing.expectEqual(@as(usize, 1), stack.undo.len);
    try std.testing.expect(stack.current == second and third.retained_by == null);
}
