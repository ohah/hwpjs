const std = @import("std");
const hx = @import("../hwpx/editor_session.zig");
const hv = @import("../hwpx/history_v2.zig");
const h5 = @import("../hwp5/edit/style_preservation.zig");
const h5v = @import("../hwp5/edit/history_v2.zig");
fn fixture(comptime name: []const u8) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/" ++ name, std.testing.allocator, .limited(4_000_000));
}
const cmd: hv.Adapter.Command = .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" };
const cmd5: h5.Command = .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "x" } };
fn live(fa: *const std.testing.FailingAllocator) usize {
    return fa.allocated_bytes - fa.freed_bytes;
}
test "MEMORY-V2 HWPX independent outer allocator exact retain including root branch and eviction" {
    const a = std.testing.allocator;
    const input = try fixture("shapeline.hwpx");
    defer a.free(input);
    var s = try hx.open(a, input, .{});
    defer s.deinit();
    var fa = std.testing.FailingAllocator.init(a, .{});
    const h = try hv.History.create(fa.allocator(), &s, .{ .max_entries = 3 });
    var alive = true;
    defer if (alive) h.deinit();
    try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    for (0..10) |_| {
        _ = try h.applyBatch(&s, &.{cmd});
        try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    }
    _ = try h.undo(&s);
    try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    _ = try h.applyBatch(&s, &.{cmd});
    try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    try std.testing.expect(h.stack.evicted > 0);
    h.deinit();
    alive = false;
    try std.testing.expectEqual(@as(usize, 0), live(&fa));
}
test "MEMORY-V2 HWP5 independent outer allocator exact retain including root branch and eviction" {
    const a = std.testing.allocator;
    const input = try fixture("charshape.hwp");
    defer a.free(input);
    const s = try h5.Session.open(a, input);
    defer s.close();
    var fa = std.testing.FailingAllocator.init(a, .{});
    const h = try h5v.History.create(fa.allocator(), s, .{ .max_entries = 3 });
    var alive = true;
    defer if (alive) h.deinit();
    try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    for (0..10) |_| {
        _ = try h.applyBatch(s, &.{cmd5});
        try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    }
    _ = try h.undo(s);
    try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    _ = try h.applyBatch(s, &.{cmd5});
    try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    try std.testing.expect(h.stack.evicted > 0);
    h.deinit();
    alive = false;
    try std.testing.expectEqual(@as(usize, 0), live(&fa));
}
test "MEMORY-V2 HWPX exact actual total accepts boundary and rejects one byte less atomically" {
    const a = std.testing.allocator;
    const input = try fixture("shapeline.hwpx");
    defer a.free(input);
    var measure = try hx.open(a, input, .{});
    defer measure.deinit();
    const mh = try hv.History.create(a, &measure, .{ .max_entries = 3 });
    defer mh.deinit();
    _ = try mh.applyBatch(&measure, &.{cmd});
    const required = mh.stack.retained_bytes;
    for ([_]usize{ required, required - 1 }) |cap| {
        var s = try hx.open(a, input, .{});
        defer s.deinit();
        var fa = std.testing.FailingAllocator.init(a, .{});
        const h = try hv.History.create(fa.allocator(), &s, .{ .max_entries = 3, .max_retained_bytes = @intCast(cap) });
        defer h.deinit();
        if (cap == required) {
            try std.testing.expect(try h.applyBatch(&s, &.{cmd}));
            try std.testing.expectEqual(cap, h.stack.retained_bytes);
        } else {
            try std.testing.expectError(error.HistoryRetainedLimitExceeded, h.applyBatch(&s, &.{cmd}));
            const saved = try s.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
            try std.testing.expectEqual(@as(u32, 0), h.stack.current.revision);
        }
        try std.testing.expectEqual(live(&fa), h.stack.retained_bytes);
    }
}
const Inject = struct {
    pub const Session = hv.Adapter.Session;
    pub const Snapshot = hv.Adapter.Snapshot;
    pub const Command = hv.Adapter.Command;
    pub const dispose = hv.Adapter.dispose;
    pub const payloadCost = hv.Adapter.payloadCost;
    pub const capture = hv.Adapter.capture;
    pub const cloneForRestore = hv.Adapter.cloneForRestore;
    pub const exchange = hv.Adapter.exchange;
    pub const rollback = hv.Adapter.rollback;
    var after_match_oom: ?*std.testing.FailingAllocator = null;
    var false_mutation = false;
    pub fn matches(v: *const Snapshot, s: *Session, limit: usize) !bool {
        const ok = try hv.Adapter.matches(v, s, limit);
        if (after_match_oom) |fa| fa.fail_index = fa.alloc_index;
        return ok;
    }
    pub fn apply(s: *Session, before: *Snapshot, commands: []const Command, limit: usize) !bool {
        const result = try hv.Adapter.apply(s, before, commands, limit);
        return if (false_mutation) false else result;
    }
};
test "MEMORY-V2 HWPX Parent restore clone OOM after successful matches preserves live and history" {
    const a = std.testing.allocator;
    const input = try fixture("shapeline.hwpx");
    defer a.free(input);
    var fa = std.testing.FailingAllocator.init(a, .{});
    var s = try hx.open(fa.allocator(), input, .{});
    defer s.deinit();
    const H = @import("../model/history_owned_format.zig").History(Inject);
    const h = try H.create(a, &s, .{});
    defer h.deinit();
    _ = try h.applyBatch(&s, &.{cmd});
    const edited = try s.save();
    defer s.allocator.free(edited);
    const bytes = h.stack.retained_bytes;
    Inject.after_match_oom = &fa;
    defer Inject.after_match_oom = null;
    try std.testing.expectError(error.OutOfMemory, h.undo(&s));
    fa.fail_index = std.math.maxInt(usize);
    Inject.after_match_oom = null;
    const after = try s.save();
    defer s.allocator.free(after);
    try std.testing.expectEqualSlices(u8, edited, after);
    try std.testing.expectEqual(@as(u32, 1), h.stack.current.revision);
    try std.testing.expectEqual(@as(usize, 0), h.stack.redo_len);
    try std.testing.expectEqual(bytes, h.stack.retained_bytes);
    try std.testing.expect(!h.poisoned);
    try std.testing.expect(try h.undo(&s));
}
test "MEMORY-V2 HWPX adapter false with real mutation is detected and rolled back" {
    const a = std.testing.allocator;
    const input = try fixture("shapeline.hwpx");
    defer a.free(input);
    var s = try hx.open(a, input, .{});
    defer s.deinit();
    const H = @import("../model/history_owned_format.zig").History(Inject);
    const h = try H.create(a, &s, .{});
    defer h.deinit();
    Inject.false_mutation = true;
    defer Inject.false_mutation = false;
    try std.testing.expectError(error.HistoryNoOpChangedState, h.applyBatch(&s, &.{cmd}));
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, input, after);
    try std.testing.expectEqual(@as(u32, 0), h.stack.current.revision);
    try std.testing.expect(!h.poisoned);
}
test "MEMORY-V2 HWPX real property batch late save failure restores resources exactly" {
    const a = std.testing.allocator;
    const input = try fixture("charshape.hwpx");
    defer a.free(input);
    var s = try hx.open(a, input, .{});
    defer s.deinit();
    const h = try hv.History.create(a, &s, .{});
    defer h.deinit();
    s.options.max_output_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, h.applyBatch(&s, &.{ .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .bold = true } }, .{ .kind = .character_properties, .paragraph = 2, .start = 1, .deleted = 1, .inserted = "", .character_properties = .{ .italic = true } } }));
    s.options.max_output_bytes = 128 * 1024 * 1024;
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, input, after);
    try std.testing.expectEqual(@as(u32, 0), h.stack.current.revision);
    try std.testing.expect(!h.poisoned);
}
