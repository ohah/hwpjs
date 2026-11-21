const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
fn selector(a: std.mem.Allocator, session: *edit.Session) !@import("cell_vertical_alignment_plan.zig").Selector {
    const rows = try session.tableBindings(a, 0);
    defer a.free(rows);
    if (rows.len < 4) return error.MissingOwnTableCells;
    return .{ .section = 0, .table_node = rows[0].table_node, .list_node = rows[0].list_node, .paragraph = rows[0].paragraph };
}
test "original cell vertical H5 session one managed history saves reopens undo redo full bytes" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const selected = try selector(a, session);
    const baseline = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    const before = try session.cellVerticalAlignment(a, selected);
    try std.testing.expect(try history.apply(session, .{ .set_cell_vertical_alignment = .{ .before = before, .value = .center } }));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    try std.testing.expectEqual(@import("../../model/cell_vertical_alignment.zig").Alignment.center, (try session.cellVerticalAlignment(a, selected)).value.?);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const values = try reopened.cellLayoutSources(a, 0);
    defer a.free(values);
    var matched: usize = 0;
    for (values) |value| if (value.list_node == selected.list_node) {
        matched += 1;
        try std.testing.expectEqual(@as(u2, 1), value.vertical_alignment);
    };
    try std.testing.expectEqual(@as(usize, 1), matched);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, baseline.bytes, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
test "original cell vertical H5 session stale and no op retain prior redo and V1 stays closed" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const selected = try selector(a, session);
    const old = try session.cellVerticalAlignment(a, selected);
    try std.testing.expect(try history.apply(session, .{ .set_cell_vertical_alignment = .{ .before = old, .value = .bottom } }));
    const expected = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(expected.bytes);
    try std.testing.expect(try history.undo(session));
    const fresh = try session.cellVerticalAlignment(a, selected);
    try std.testing.expect(!try history.apply(session, .{ .set_cell_vertical_alignment = .{ .before = fresh, .value = .top } }));
    try std.testing.expectError(error.StaleMutationEpoch, history.apply(session, .{ .set_cell_vertical_alignment = .{ .before = old, .value = .center } }));
    try std.testing.expect(try history.redo(session));
    const after = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, expected.bytes, after.bytes);
    const other = try edit.Session.open(a, input);
    defer other.close();
    var legacy = try History.init(a, other, 4, 4000000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(other, .{ .set_cell_vertical_alignment = .{ .before = old, .value = .center } }));
}
test "original cell vertical H5 session pending cell size survives source basis alignment publication" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const selected = try selector(a, session);
    try std.testing.expect(try history.apply(session, .{ .set_cell_size = .{ .section = 0, .list_node = selected.list_node, .width = 1234, .height = 5678 } }));
    const before = try session.cellVerticalAlignment(a, selected);
    try std.testing.expect(try history.apply(session, .{ .set_cell_vertical_alignment = .{ .before = before, .value = .bottom } }));
    const rows = try session.tableBindings(a, 0);
    defer a.free(rows);
    for (rows) |row| if (row.list_node == selected.list_node) {
        try std.testing.expectEqual(@as(u32, 1234), row.width);
        try std.testing.expectEqual(@as(u32, 5678), row.height);
    };
}
