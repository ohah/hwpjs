const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const plan = @import("cell_insets_plan.zig");
fn selector(a: std.mem.Allocator, session: *edit.Session) !plan.Selector {
    const rows = try session.tableBindings(a, 0);
    defer a.free(rows);
    if (rows.len < 4) return error.MissingOwnTableCells;
    return .{ .section = 0, .table_node = rows[0].table_node, .list_node = rows[0].list_node, .paragraph = rows[0].paragraph };
}
test "original cell insets H5 one commit inherited axes save fresh reopen undo redo exact bytes" {
    const a = std.testing.allocator;
    const input = try @import("cell_insets_file_fixture.zig").make(a);
    defer a.free(input);
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    const selected = try selector(a, s);
    const baseline = try s.save(a, .{});
    defer a.free(baseline.bytes);
    const before = try s.cellInsets(a, selected);
    try std.testing.expectEqual(false, before.source.use_cell.?);
    try std.testing.expect(try history.apply(s, .{ .set_cell_insets = .{ .before = before, .patch = .{ .custom = .{ 720, null, null, null } } } }));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const current = try s.cellInsets(a, selected);
    try std.testing.expectEqualDeep([4]?i64{ 720, 288, 432, 576 }, current.source.cell);
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const rows = try reopened.cellLayoutSources(a, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 4), rows.len);
    for (rows) |row| {
        if (row.list_node == selected.list_node) {
            try std.testing.expect(row.has_margin);
            try std.testing.expectEqualDeep([4]i16{ 720, 288, 432, 576 }, row.margins);
        } else {
            try std.testing.expect(!row.has_margin);
            try std.testing.expectEqualDeep([4]i16{ 10, 20, 30, 40 }, row.margins);
        }
    }
    try std.testing.expect(try history.undo(s));
    const undone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, baseline.bytes, undone.bytes);
    try std.testing.expect(try history.redo(s));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
test "original cell insets H5 no op stale invalid and legacy refusal preserve prior redo" {
    const a = std.testing.allocator;
    const input = try @import("cell_insets_file_fixture.zig").make(a);
    defer a.free(input);
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    const selected = try selector(a, s);
    const old = try s.cellInsets(a, selected);
    try std.testing.expectError(error.HistoryProtocol2Required, s.apply(.{ .set_cell_insets = .{ .before = old, .patch = .inherit } }));
    try std.testing.expect(try history.apply(s, .{ .set_cell_insets = .{ .before = old, .patch = .{ .custom = .{ 720, null, null, null } } } }));
    const expected = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(expected.bytes);
    try std.testing.expect(try history.undo(s));
    const fresh = try s.cellInsets(a, selected);
    {
        const foreign = try edit.Session.open(a, input);
        defer foreign.close();
        foreign.enableHistoryDelta();
        var foreign_history = try History.initV2(a, foreign, .{});
        defer foreign_history.deinit();
        const foreign_before = try foreign.cellInsets(a, try selector(a, foreign));
        try std.testing.expectEqualSlices(u8, &fresh.source_sha256, &foreign_before.source_sha256);
        try std.testing.expectError(error.StaleMutationEpoch, history.apply(s, .{ .set_cell_insets = .{ .before = foreign_before, .patch = .inherit } }));
    }
    try std.testing.expect(!try history.apply(s, .{ .set_cell_insets = .{ .before = fresh, .patch = .inherit } }));
    try std.testing.expectError(error.UnsupportedCellInsets, history.apply(s, .{ .set_cell_insets = .{ .before = fresh, .patch = .{ .custom = .{ 32768, null, null, null } } } }));
    try std.testing.expectError(error.StaleMutationEpoch, history.apply(s, .{ .set_cell_insets = .{ .before = old, .patch = .inherit } }));
    try std.testing.expect(try history.redo(s));
    const after = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, expected.bytes, after.bytes);
    const other = try edit.Session.open(a, input);
    defer other.close();
    var legacy = try History.init(a, other, 4, 4000000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(other, .{ .set_cell_insets = .{ .before = old, .patch = .inherit } }));
}
test "original cell insets H5 explicit zero inheritance and pending size survive source basis" {
    const a = std.testing.allocator;
    const input = try @import("cell_insets_file_fixture.zig").make(a);
    defer a.free(input);
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    const selected = try selector(a, s);
    try std.testing.expect(try history.apply(s, .{ .set_cell_size = .{ .section = 0, .list_node = selected.list_node, .width = 1234, .height = 5678 } }));
    const before = try s.cellInsets(a, selected);
    try std.testing.expectEqual(@as(u32, 1234), before.frame.width);
    try std.testing.expect(try history.apply(s, .{ .set_cell_insets = .{ .before = before, .patch = .{ .custom = .{ 0, null, null, null } } } }));
    const current = try s.cellInsets(a, selected);
    try std.testing.expectEqualDeep([4]?i64{ 0, 288, 432, 576 }, current.source.cell);
    try std.testing.expect(try history.apply(s, .{ .set_cell_insets = .{ .before = current, .patch = .inherit } }));
    const inherited = try s.cellInsets(a, selected);
    try std.testing.expect(!inherited.source.use_cell.?);
    try std.testing.expectEqualDeep(current.source.cell, inherited.source.cell);
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const bindings = try reopened.tableBindings(a, 0);
    defer a.free(bindings);
    for (bindings) |row| if (row.list_node == selected.list_node) {
        try std.testing.expectEqual(@as(u32, 1234), row.width);
        try std.testing.expectEqual(@as(u32, 5678), row.height);
    };
}
test "original cell insets H5 protected cell refusal preserves complete source file" {
    const a = std.testing.allocator;
    const input = try @import("cell_insets_file_fixture.zig").makeWithAttributes(a, 1 << 17);
    defer a.free(input);
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var history = try History.initV2(a, s, .{});
    defer history.deinit();
    const selected = try selector(a, s);
    const before = try s.cellInsets(a, selected);
    try std.testing.expectError(error.CellInsetsReadOnly, history.apply(s, .{ .set_cell_insets = .{ .before = before, .patch = .{ .custom = .{ 720, null, null, null } } } }));
    const unchanged = try s.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
}
