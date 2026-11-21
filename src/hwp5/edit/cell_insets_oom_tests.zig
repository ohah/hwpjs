//! Separate managed mutation sweep: setup and post-failure oracles are not fault injected.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
fn trial(a: std.mem.Allocator, tracking: *std.testing.FailingAllocator, input: []const u8, failure: ?usize) !bool {
    const oracle = std.testing.allocator;
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    const rows = try s.tableBindings(oracle, 0);
    defer oracle.free(rows);
    if (rows.len < 4) return error.MissingOwnTableCells;
    const selected: @import("cell_insets_plan.zig").Selector = .{ .section = 0, .table_node = rows[0].table_node, .list_node = rows[0].list_node, .paragraph = rows[0].paragraph };
    try std.testing.expect(try history.apply(s, .{ .set_cell_size = .{ .section = 0, .list_node = selected.list_node, .width = 9000, .height = 5000 } }));
    const redo_target = try s.save(oracle, .{ .allow_stale_layout = true });
    defer oracle.free(redo_target.bytes);
    try std.testing.expect(try history.undo(s));
    const baseline = try s.save(oracle, .{ .allow_stale_layout = true });
    defer oracle.free(baseline.bytes);
    const stats = history.stats();
    try std.testing.expectEqual(@as(usize, 1), stats.redoCount);
    const before = try s.cellInsets(oracle, selected);
    if (failure) |offset| tracking.fail_index = try std.math.add(usize, tracking.alloc_index, offset);
    const outcome = history.apply(s, .{ .set_cell_insets = .{ .before = before, .patch = .{ .custom = .{ 720, null, null, null } } } });
    tracking.fail_index = std.math.maxInt(usize);
    if (outcome) |changed| {
        try std.testing.expect(changed);
        try std.testing.expect(!tracking.has_induced_failure);
        try std.testing.expect(try history.undo(s));
        const restored = try s.save(oracle, .{ .allow_stale_layout = true });
        defer oracle.free(restored.bytes);
        try std.testing.expectEqualSlices(u8, baseline.bytes, restored.bytes);
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
    const input = try @import("cell_insets_file_fixture.zig").make(a);
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

test "managed cell insets H5 mutation allocation failures preserve bytes redo and trial ownership" {
    try sweep(false);
}
test "managed cell insets H5 mutation NoResize allocation failures preserve bytes redo and trial ownership" {
    try sweep(true);
}
