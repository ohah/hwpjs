//! Prepared managed sweeps. Setup and post-failure oracles are not fault injected.
const std = @import("std");
const fixture = @import("picture_crop_fixture.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
fn trial(a: std.mem.Allocator, tracking: *std.testing.FailingAllocator, input: []const u8, failure: ?usize) !bool {
    const oracle = std.testing.allocator;
    const s = try Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    const selected = try fixture.selector(oracle, s);
    const original = try s.pictureCrop(selected);
    try std.testing.expect(try history.apply(s, .{ .set_picture_crop = .{ .before = original, .rect = .{ .left = 150, .top = 0, .right = 4800, .bottom = 2400 } } }));
    const redo_target = try s.save(oracle, .{ .allow_stale_layout = true });
    defer oracle.free(redo_target.bytes);
    const last_committed_revision = history.revision();
    try std.testing.expectEqual(@as(u32, 1), last_committed_revision);
    try std.testing.expect(try history.undo(s));
    const baseline = try s.save(oracle, .{ .allow_stale_layout = true });
    defer oracle.free(baseline.bytes);
    const stats = history.stats();
    try std.testing.expectEqual(@as(u32, 0), stats.revision);
    try std.testing.expectEqual(@as(usize, 1), stats.redoCount);
    const before = try s.pictureCrop(selected);
    if (failure) |offset| tracking.fail_index = try std.math.add(usize, tracking.alloc_index, offset);
    const outcome = history.apply(s, .{ .set_picture_crop = .{ .before = before, .rect = .{ .left = 75, .top = 150, .right = 4725, .bottom = 2250 } } });
    tracking.fail_index = std.math.maxInt(usize);
    if (outcome) |changed| {
        try std.testing.expect(changed);
        try std.testing.expect(!tracking.has_induced_failure);
        try std.testing.expectEqual(last_committed_revision + 1, history.revision());
        try std.testing.expectEqual(@as(usize, 0), history.stats().redoCount);
        const saved = try s.save(oracle, .{ .allow_stale_layout = true });
        defer oracle.free(saved.bytes);
        try fixture.assertRaw(oracle, input, saved.bytes, .{ .left = 75, .top = 150, .right = 4725, .bottom = 2250 });
        return true;
    } else |err| {
        if (err != error.OutOfMemory) return err;
        try std.testing.expect(tracking.has_induced_failure);
        const unchanged = try s.save(oracle, .{ .allow_stale_layout = true });
        defer oracle.free(unchanged.bytes);
        try std.testing.expectEqualSlices(u8, baseline.bytes, unchanged.bytes);
        try std.testing.expectEqual(stats.redoCount, history.stats().redoCount);
        try std.testing.expectEqual(stats.revision, history.revision());
        try std.testing.expect(try history.redo(s));
        const redone = try s.save(oracle, .{ .allow_stale_layout = true });
        defer oracle.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, redo_target.bytes, redone.bytes);
        return false;
    }
}
fn sweep(no_resize_mode: bool) !void {
    const a = std.testing.allocator;
    const input = try fixture.make(a, fixture.png);
    defer a.free(input);
    var control = std.testing.FailingAllocator.init(a, .{});
    var control_no_resize: @import("../../testing/no_resize_allocator.zig").NoResize = .{ .backing = control.allocator() };
    try std.testing.expect(try trial(if (no_resize_mode) control_no_resize.allocator() else control.allocator(), &control, input, null));
    try std.testing.expectEqual(control.allocated_bytes, control.freed_bytes);
    var index: usize = 0;
    while (true) : (index = try std.math.add(usize, index, 1)) {
        var tracking = std.testing.FailingAllocator.init(a, .{});
        var no_resize: @import("../../testing/no_resize_allocator.zig").NoResize = .{ .backing = tracking.allocator() };
        const success = try trial(if (no_resize_mode) no_resize.allocator() else tracking.allocator(), &tracking, input, index);
        try std.testing.expectEqual(tracking.allocated_bytes, tracking.freed_bytes);
        if (success) break;
    }
}
test "H5 source crop OOM managed mutation preserves redo raw and trial ownership" {
    try sweep(false);
}
test "H5 source crop OOM NoResize exhaustive fallback preserves redo raw and trial ownership" {
    try sweep(true);
}
