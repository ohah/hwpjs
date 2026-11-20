//! Test-only bounded-policy measurement. No retained-byte formula is reproduced.
const std = @import("std");
const hx = @import("../hwpx/editor_session.zig");
const hv = @import("../hwpx/history_v2.zig");
pub const Phase = enum { seed, candidate, one_less };
pub const Sample = struct {
    phase: Phase,
    round: usize,
    cap: usize,
    retained: usize,
    outer_live: usize,
    reserved_slots: usize,
    metadata: usize,
    admitted: bool,
    revision: u32,
    apply_calls: usize = 1,
};
pub const Observer = struct {
    context: *anyopaque,
    emit: *const fn (*anyopaque, Sample) void,
};
pub const Boundary = struct {
    cap: usize,
    rounds: usize,
    round_bound: usize,
    samples: usize,
    reservation_descents: usize,
};
fn live(fa: *const std.testing.FailingAllocator) usize {
    return fa.allocated_bytes - fa.freed_bytes;
}
fn probe(a: std.mem.Allocator, input: []const u8, commands: []const hv.Adapter.Command, max_entries: u32, cap: ?usize, phase: Phase, round: usize) !Sample {
    var session = try hx.open(a, input, .{});
    defer session.deinit();
    var fa = std.testing.FailingAllocator.init(a, .{});
    // Runs after the History defer, including all unexpected failure paths.
    defer std.testing.expectEqual(@as(usize, 0), live(&fa)) catch @panic("bounded measurement leaked history bytes");
    const history = try hv.History.create(fa.allocator(), &session, .{
        .max_entries = max_entries,
        .max_retained_bytes = if (cap) |value| @as(u32, @intCast(value)) else null,
    });
    defer history.deinit();
    try std.testing.expectEqual(live(&fa), history.stack.retained_bytes);
    try std.testing.expectEqual(@as(u32, 0), history.stack.current.revision);
    const initial_retained = history.stack.retained_bytes;
    var admitted = true;
    var apply_calls: usize = 0;
    apply_calls += 1;
    const changed = history.applyBatch(&session, commands) catch |err| blk: {
        // Only the exploratory cap-1 probe may observe a budget refusal.
        // Capture/OOM/setup errors and unexpected exact-cap refusals are errors.
        if (phase != .one_less or err != error.HistoryRetainedLimitExceeded) return err;
        admitted = false;
        break :blk false;
    };
    if (admitted) {
        try std.testing.expect(changed);
        try std.testing.expectEqual(@as(u32, 1), history.stack.current.revision);
    } else {
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, input, saved);
        try std.testing.expectEqual(@as(u32, 0), history.stack.current.revision);
        try std.testing.expectEqual(initial_retained, history.stack.retained_bytes);
        try std.testing.expectEqual(@as(usize, 0), history.stack.undo_len);
        try std.testing.expectEqual(@as(usize, 0), history.stack.redo_len);
        try std.testing.expect(!history.poisoned);
    }
    try std.testing.expectEqualSlices(u8, input, session.source);
    try std.testing.expectEqual(live(&fa), history.stack.retained_bytes);
    try std.testing.expectEqual(history.stack.metadata_bytes + history.stack.current.ownedBytes() + history.stack.undo.owned_bytes + history.stack.redo.owned_bytes, history.stack.retained_bytes);
    try std.testing.expectEqual(history.stack.undo.slots.len, history.stack.redo.slots.len);
    return .{
        .phase = phase,
        .round = round,
        .cap = history.stack.policy.max_retained_bytes,
        .retained = history.stack.retained_bytes,
        .outer_live = live(&fa),
        .reserved_slots = history.stack.undo.slots.len,
        .metadata = history.stack.metadata_bytes,
        .admitted = admitted,
        .revision = history.stack.current.revision,
        .apply_calls = apply_calls,
    };
}
fn notify(observer: ?Observer, sample: Sample) void {
    // The probe's History has already been destroyed and outer live==0 checked.
    // Only scalar copies are exposed; the callback cannot mutate that History.
    if (observer) |current| current.emit(current.context, sample);
}
/// Every probe creates a fresh Session/History and applies the command once.
/// Cap can only decrease following a strict observed reservation descent. A
/// stable cap alone is insufficient: cap-1 must atomically refuse as well.
pub fn find(a: std.mem.Allocator, input: []const u8, commands: []const hv.Adapter.Command, max_entries: u32, observer: ?Observer) !Boundary {
    const seed = try probe(a, input, commands, max_entries, null, .seed, 0);
    notify(observer, seed);
    var samples: usize = 1;
    var candidate = seed.retained;
    var previous_slots = seed.reserved_slots;
    var descents: usize = 0;
    const bound = @as(usize, max_entries) + 1;
    try std.testing.expect(candidate > 0 and previous_slots > 0 and previous_slots <= max_entries);
    for (0..bound) |index| {
        const exact = try probe(a, input, commands, max_entries, candidate, .candidate, index + 1);
        notify(observer, exact);
        samples += 1;
        try std.testing.expect(exact.admitted);
        try std.testing.expect(exact.reserved_slots > 0 and exact.reserved_slots <= previous_slots);
        try std.testing.expect(exact.retained > 0 and exact.retained <= candidate);
        if (exact.retained < candidate) {
            try std.testing.expect(exact.reserved_slots < previous_slots);
            candidate = exact.retained;
            previous_slots = exact.reserved_slots;
            descents += 1;
            continue;
        }
        try std.testing.expectEqual(candidate, exact.retained);
        const lower = try probe(a, input, commands, max_entries, candidate - 1, .one_less, index + 1);
        notify(observer, lower);
        samples += 1;
        try std.testing.expect(lower.reserved_slots > 0 and lower.reserved_slots <= exact.reserved_slots);
        if (lower.admitted) {
            // Crossing a reservation threshold can expose a lower boundary.
            // This is discovery, never acceptance of the final cap-1 case.
            try std.testing.expect(lower.reserved_slots < exact.reserved_slots);
            try std.testing.expect(lower.retained > 0 and lower.retained <= candidate - 1);
            candidate = lower.retained;
            previous_slots = lower.reserved_slots;
            descents += 1;
            continue;
        }
        return .{ .cap = candidate, .rounds = index + 1, .round_bound = bound, .samples = samples, .reservation_descents = descents };
    }
    return error.HistoryMemoryBoundaryDidNotStabilize;
}
