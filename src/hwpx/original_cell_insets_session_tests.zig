const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
fn selected(a: std.mem.Allocator, session: *const editor.Session) !@import("table_display_bindings.zig").Binding {
    const rows = try @import("table_display_bindings.zig").read(a, session, 0);
    defer a.free(rows);
    if (rows.len < 4) return error.MissingOwnTableCells;
    return rows[0];
}
fn command(request: *const @import("original_cell_insets_history.zig").Request) @import("editor_history.zig").Command {
    return .{ .kind = .original_cell_insets, .section = request.section, .paragraph = request.paragraph, .start = 0, .deleted = 0, .inserted = "", .original_cell_insets = request };
}
test "original cell insets HX session one parked history saves reopens undo redo full bytes" {
    const a = std.testing.allocator;
    const input = try @import("original_cell_insets_file_fixture.zig").make(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const cell = try selected(a, &session);
    const baseline = try session.save();
    defer a.free(baseline);
    var before = try history.originalCellInsets(&session, a, 0, cell.paragraph);
    defer before.deinit(a);
    const request: @import("original_cell_insets_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = before, .value = .{ .custom = .{ 100, null, null, null } } };
    try std.testing.expect(try history.apply(&session, command(&request)));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const current = try selected(a, &reopened);
    const value = try @import("table_cell_margin_values.zig").readList(a, &reopened.sections[0].tree, current.owner.list_node);
    try std.testing.expect(value.has_margin.?);
    try std.testing.expectEqual(@as(?i64, 100), value.margin.?[0]);
    try std.testing.expectEqualDeep([4]?i64{ 100, 288, 432, 576 }, value.margin.?);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
test "original cell insets HX session stale no op preserve prior redo and V1 stays closed" {
    const a = std.testing.allocator;
    const input = try @import("original_cell_insets_file_fixture.zig").make(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const cell = try selected(a, &session);
    var before = try history.originalCellInsets(&session, a, 0, cell.paragraph);
    defer before.deinit(a);
    const first: @import("original_cell_insets_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = before, .value = .{ .custom = .{ 200, null, null, null } } };
    try std.testing.expect(try history.apply(&session, command(&first)));
    const expected = try session.save();
    defer a.free(expected);
    try std.testing.expect(try history.undo(&session));
    var fresh = try history.originalCellInsets(&session, a, 0, cell.paragraph);
    defer fresh.deinit(a);
    const noop: @import("original_cell_insets_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = fresh, .value = .inherit };
    try std.testing.expect(!try history.apply(&session, command(&noop)));
    try std.testing.expectError(error.StaleOriginalCellInsets, history.apply(&session, command(&first)));
    try std.testing.expect(try history.redo(&session));
    const actual = try session.save();
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
    // Same-value requests and stale authority are decided before capacity counters.
    try std.testing.expect(try history.undo(&session));
    for ([_]bool{ false, true }) |exhaust_epoch| {
        const engine = history.owned.?;
        const next_revision = engine.stack.next_revision;
        const epoch = engine.stack.epoch;
        defer {
            engine.stack.next_revision = next_revision;
            engine.stack.epoch = epoch;
        }
        var current = try history.originalCellInsets(&session, a, 0, cell.paragraph);
        defer current.deinit(a);
        const at_boundary: @import("original_cell_insets_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = current, .value = .inherit };
        if (exhaust_epoch) engine.stack.epoch = std.math.maxInt(u64) else engine.stack.next_revision = std.math.maxInt(u32);
        const unchanged_stats = history.stats();
        try std.testing.expect(!try history.apply(&session, command(&at_boundary)));
        try std.testing.expectEqual(unchanged_stats.revision, history.revision());
        try std.testing.expectEqual(unchanged_stats.redoCount, history.stats().redoCount);
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, input, unchanged);
        var stale_boundary = at_boundary;
        stale_boundary.before.ticket.epoch += 1;
        try std.testing.expectError(error.StaleOriginalCellInsets, history.apply(&session, command(&stale_boundary)));
        var foreign_session = try editor.open(a, input, .{});
        defer foreign_session.deinit();
        foreign_session.history_delta_managed = true;
        var foreign_history = try History.initV2(&foreign_session, .{});
        defer foreign_history.deinit();
        var foreign_before = try foreign_history.originalCellInsets(&foreign_session, a, 0, cell.paragraph);
        defer foreign_before.deinit(a);
        try std.testing.expectEqualSlices(u8, &current.source_sha256, &foreign_before.source_sha256);
        const foreign_noop: @import("original_cell_insets_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = foreign_before, .value = .inherit };
        try std.testing.expectError(error.StaleOriginalCellInsets, history.apply(&session, command(&foreign_noop)));
        var real_change = at_boundary;
        real_change.value = .{ .custom = .{ 720, null, null, null } };
        try std.testing.expectError(error.HistoryRevisionExhausted, history.apply(&session, command(&real_change)));
    }
    try std.testing.expect(try history.redo(&session));
    const preserved_redo = try session.save();
    defer a.free(preserved_redo);
    try std.testing.expectEqualSlices(u8, expected, preserved_redo);
    var other = try editor.open(a, input, .{});
    defer other.deinit();
    var legacy = try History.init(&other, 4, 4000000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(&other, command(&first)));
}
test "original cell insets HX session pending cell size is retained by current save candidate" {
    const a = std.testing.allocator;
    const input = try @import("original_cell_insets_file_fixture.zig").make(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const cell = try selected(a, &session);
    try std.testing.expect(try history.apply(&session, .{ .kind = .cell_size, .section = 0, .paragraph = cell.paragraph, .start = 0, .deleted = 0, .inserted = "", .list_node = cell.owner.list_node, .cell_size = .{ .width = 1234, .height = 5678 } }));
    var before = try history.originalCellInsets(&session, a, 0, cell.paragraph);
    defer before.deinit(a);
    const request: @import("original_cell_insets_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = before, .value = .{ .custom = .{ 200, null, null, null } } };
    try std.testing.expect(try history.apply(&session, command(&request)));
    const current = try selected(a, &session);
    try std.testing.expectEqual(@as(?u32, 1234), current.owner.cell.width);
    try std.testing.expectEqual(@as(?u32, 5678), current.owner.cell.height);
}
