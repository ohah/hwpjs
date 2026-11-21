//! Fault injection starts only at the real managed mutation, after fixture/history setup.
const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const insets = @import("original_cell_insets_history.zig");
fn command(request: *const insets.Request) @import("editor_history.zig").Command {
    return .{ .kind = .original_cell_insets, .section = request.section, .paragraph = request.paragraph, .start = 0, .deleted = 0, .inserted = "", .original_cell_insets = request };
}
fn trial(a: std.mem.Allocator, tracking: *std.testing.FailingAllocator, input: []const u8, failure: ?usize) !bool {
    const oracle = std.testing.allocator;
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const rows = try @import("table_display_bindings.zig").read(oracle, &session, 0);
    defer oracle.free(rows);
    if (rows.len < 4) return error.MissingOwnTableCells;
    const selected = rows[0];
    try std.testing.expect(try history.apply(&session, .{ .kind = .cell_size, .section = 0, .paragraph = selected.paragraph, .start = 0, .deleted = 0, .inserted = "", .list_node = selected.owner.list_node, .cell_size = .{ .width = 9000, .height = 5000 } }));
    const redo_target = try session.save();
    defer a.free(redo_target);
    try std.testing.expect(try history.undo(&session));
    const baseline = try session.save();
    defer a.free(baseline);
    const stats = history.stats();
    try std.testing.expectEqual(@as(usize, 1), stats.redoCount);
    var before = try history.originalCellInsets(&session, oracle, 0, selected.paragraph);
    defer before.deinit(oracle);
    const request: insets.Request = .{ .section = 0, .paragraph = selected.paragraph, .revision = history.revision(), .before = before, .value = .{ .custom = .{ 720, null, null, null } } };
    // Set the relative failure index immediately before the only injected operation.
    if (failure) |offset| tracking.fail_index = try std.math.add(usize, tracking.alloc_index, offset);
    const outcome = history.apply(&session, command(&request));
    tracking.fail_index = std.math.maxInt(usize);
    if (outcome) |changed| {
        try std.testing.expect(changed);
        try std.testing.expect(!tracking.has_induced_failure);
        try std.testing.expect(try history.undo(&session));
        const restored = try session.save();
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, baseline, restored);
        return true;
    } else |err| {
        // No source/owner/history error is accepted as an allocation-failure result.
        if (err != error.OutOfMemory) return err;
        try std.testing.expect(tracking.has_induced_failure);
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, baseline, unchanged);
        try std.testing.expectEqual(stats.redoCount, history.stats().redoCount);
        try std.testing.expectEqual(stats.revision, history.revision());
        try std.testing.expect(try history.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, redo_target, redone);
        return false;
    }
}
fn sweep(no_resize_mode: bool) !void {
    const a = std.testing.allocator;
    const input = try @import("original_cell_insets_file_fixture.zig").make(a);
    defer a.free(input);
    var control = std.testing.FailingAllocator.init(a, .{});
    var control_no_resize: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = control.allocator() };
    try std.testing.expect(try trial(if (no_resize_mode) control_no_resize.allocator() else control.allocator(), &control, input, null));
    // trial returns only after history/session and every owned output have closed.
    try std.testing.expectEqual(control.allocated_bytes, control.freed_bytes);
    var index: usize = 0;
    while (true) : (index = try std.math.add(usize, index, 1)) {
        var tracking = std.testing.FailingAllocator.init(a, .{});
        var no_resize: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = tracking.allocator() };
        const success = try trial(if (no_resize_mode) no_resize.allocator() else tracking.allocator(), &tracking, input, index);
        try std.testing.expectEqual(tracking.allocated_bytes, tracking.freed_bytes);
        if (success) break;
    }
}
test "managed cell insets HX mutation allocation failures preserve bytes redo and trial ownership" {
    try sweep(false);
}
test "managed cell insets HX mutation NoResize allocation failures preserve bytes redo and trial ownership" {
    try sweep(true);
}
