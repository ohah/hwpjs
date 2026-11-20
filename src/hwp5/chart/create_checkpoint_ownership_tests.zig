//! Per-trial pending-resource ownership tests. No chart Command or visual claim.
const std = @import("std");
const a = std.testing.allocator;
const measure = @import("../../testing/bounded_allocation_probe.zig");
const cp = @import("../edit/table_checkpoint.zig");
const model = @import("../../model/document.zig");
const Tables = @import("../edit/created_table_values.zig").Values;
const Backgrounds = @import("../edit/cell_background_values.zig").Values;
const Resources = @import("created_resources.zig").Values;
const fixture = @import("create_test_fixture.zig");
const limit = 1024 * 1024;

fn restoreCycle(allocator: std.mem.Allocator, input: Resources) !void {
    var document: model.Document = .{ .format = .hwp5, .sections = &.{} };
    defer document.deinit(allocator);
    var tables: []Tables = &.{};
    defer allocator.free(tables);
    var backgrounds: Backgrounds = .{};
    defer backgrounds.deinit(allocator);
    var live = try input.clone(allocator, limit);
    defer live.deinit(allocator);
    var owner: u8 = 0;
    // Stored History arena and Parent-owned restore values use different allocators.
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const storage = arena.allocator();
    const snapshot = try cp.captureWithCharts(storage, &owner, &document, tables, backgrounds, live, limit);
    defer snapshot.deinit();
    const restored = try cp.cloneTo(snapshot, allocator, &owner, limit);
    defer restored.deinit();
    live.entries[0].bytes[0] ^= 1;
    live.docinfo.?[0] ^= 1;
    try std.testing.expect(!try cp.matchesWithCharts(restored, allocator, &owner, &document, tables, backgrounds, live));
    try cp.exchangeWithCharts(restored, allocator, &owner, &document, &tables, &backgrounds, &live);
    try std.testing.expect(input.equals(live));
    try cp.exchangeWithCharts(restored, allocator, &owner, &document, &tables, &backgrounds, &live);
    try std.testing.expect(!input.equals(live));
    // The immutable arena snapshot must not have inherited either Parent mutation.
    const independent = try cp.cloneTo(snapshot, allocator, &owner, limit);
    defer independent.deinit();
    try cp.rollbackWithCharts(independent, allocator, &owner, &document, &tables, &backgrounds, &live);
    try std.testing.expect(input.equals(live));
}

fn lateCloneRefusal(allocator: std.mem.Allocator, input: Resources) !void {
    const document: model.Document = .{ .format = .hwp5, .sections = &.{} };
    var owner: u8 = 0;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const snapshot = try cp.captureWithCharts(arena.allocator(), &owner, &document, &.{}, .{}, input, limit);
    defer snapshot.deinit();
    const exact = try cp.sizeWithCharts(&document, &.{}, .{}, input, limit);
    if (cp.cloneTo(snapshot, allocator, &owner, exact - 1)) |unexpected| {
        unexpected.deinit();
        return error.TestExpectedError;
    } else |err| {
        if (err != error.LimitExceeded) return err;
    }
    try std.testing.expect(try cp.matchesWithCharts(snapshot, arena.allocator(), &owner, &document, &.{}, .{}, input));
}

fn sweep(comptime callback: anytype) !void {
    const info = try fixture.docinfo(a);
    defer a.free(info);
    var prepared = try @import("create_resources.zig").prepare(a, info, fixture.version, fixture.names, fixture.data, fixture.fallback, .{});
    defer prepared.deinit(a);
    var entries = [_]@import("created_resources.zig").Entry{
        .{ .ordinal = prepared.docinfo.ids.ordinals.ole, .physical = prepared.docinfo.ids.physical.ole, .path = prepared.ole_path, .bytes = prepared.ole },
        .{ .ordinal = prepared.docinfo.ids.ordinals.fallback, .physical = prepared.docinfo.ids.physical.fallback, .path = prepared.fallback_path, .bytes = prepared.fallback },
    };
    // Borrowed view: Prepared owns every byte until all trials end.
    const input: Resources = .{ .docinfo = prepared.docinfo.bytes, .entries = &entries };
    var before = try input.clone(a, limit);
    defer before.deinit(a);
    const baseline = try measure.measureFallback(callback, .{input}, null);
    try std.testing.expect(baseline.allocations > 0);
    try std.testing.expect(before.equals(input));
    for (0..baseline.allocations) |index| {
        const trial = try measure.measureFallback(callback, .{input}, index);
        try std.testing.expectEqual(trial.allocated_bytes, trial.freed_bytes);
        try std.testing.expect(before.equals(input));
    }
    try std.testing.expectError(error.FailureIndexNotReached, measure.measureFallback(callback, .{input}, baseline.allocations));
    try std.testing.expect(before.equals(input));
    std.debug.print("H5_CHART_CHECKPOINT_OWNERSHIP failures={d} per_trial_live_zero=true no_resize=true\n", .{baseline.allocations});
}

test "H5 chart checkpoint ownership arena snapshots and Parent restore exchange under every allocation failure" {
    try sweep(restoreCycle);
}

test "H5 chart checkpoint ownership late combined budget rejection frees every detached clone" {
    try sweep(lateCloneRefusal);
}

test "H5 chart checkpoint ownership wrong owner refuses before restore allocation" {
    const document: model.Document = .{ .format = .hwp5, .sections = &.{} };
    var owner: u8 = 0;
    var other: u8 = 0;
    const snapshot = try cp.captureWithCharts(a, &owner, &document, &.{}, .{}, .{}, limit);
    defer snapshot.deinit();
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.SourceBindingMismatch, cp.cloneTo(snapshot, failing.allocator(), &other, limit));
    try std.testing.expect(!failing.has_induced_failure);
    try std.testing.expect(try cp.matchesWithCharts(snapshot, a, &owner, &document, &.{}, .{}, .{}));
}
