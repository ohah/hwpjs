const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
fn selected(a: std.mem.Allocator, session: *const editor.Session) !@import("table_display_bindings.zig").Binding {
    const rows = try @import("table_display_bindings.zig").read(a, session, 0);
    defer a.free(rows);
    if (rows.len < 4) return error.MissingOwnTableCells;
    return rows[0];
}
fn command(request: *const @import("cell_vertical_alignment_history.zig").Request) @import("editor_history.zig").Command {
    return .{ .kind = .cell_vertical_alignment, .section = request.section, .paragraph = request.paragraph, .start = 0, .deleted = 0, .inserted = "", .cell_vertical_alignment = request };
}
test "original cell vertical HX session one parked history saves reopens undo redo full bytes" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const cell = try selected(a, &session);
    const baseline = try session.save();
    defer a.free(baseline);
    var before = try history.cellVerticalAlignment(&session, a, 0, cell.paragraph);
    defer before.deinit(a);
    const request: @import("cell_vertical_alignment_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = before, .value = .center };
    try std.testing.expect(try history.apply(&session, command(&request)));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const current = try selected(a, &reopened);
    const value = try @import("table_cell_margin_values.zig").readList(a, &reopened.sections[0].tree, current.owner.list_node);
    try std.testing.expectEqual(@as(?u32, 1), value.vertical_alignment);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
test "original cell vertical HX session stale no op preserve prior redo and V1 stays closed" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const cell = try selected(a, &session);
    var before = try history.cellVerticalAlignment(&session, a, 0, cell.paragraph);
    defer before.deinit(a);
    const first: @import("cell_vertical_alignment_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = before, .value = .bottom };
    try std.testing.expect(try history.apply(&session, command(&first)));
    const expected = try session.save();
    defer a.free(expected);
    try std.testing.expect(try history.undo(&session));
    var fresh = try history.cellVerticalAlignment(&session, a, 0, cell.paragraph);
    defer fresh.deinit(a);
    const noop: @import("cell_vertical_alignment_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = fresh, .value = .top };
    try std.testing.expect(!try history.apply(&session, command(&noop)));
    try std.testing.expectError(error.StaleCellVerticalAlignment, history.apply(&session, command(&first)));
    try std.testing.expect(try history.redo(&session));
    const actual = try session.save();
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
    var other = try editor.open(a, input, .{});
    defer other.deinit();
    var legacy = try History.init(&other, 4, 4000000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(&other, command(&first)));
}
test "original cell vertical HX session pending cell size is retained by current save candidate" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const cell = try selected(a, &session);
    try std.testing.expect(try history.apply(&session, .{ .kind = .cell_size, .section = 0, .paragraph = cell.paragraph, .start = 0, .deleted = 0, .inserted = "", .list_node = cell.owner.list_node, .cell_size = .{ .width = 1234, .height = 5678 } }));
    var before = try history.cellVerticalAlignment(&session, a, 0, cell.paragraph);
    defer before.deinit(a);
    const request: @import("cell_vertical_alignment_history.zig").Request = .{ .section = 0, .paragraph = cell.paragraph, .revision = history.revision(), .before = before, .value = .bottom };
    try std.testing.expect(try history.apply(&session, command(&request)));
    const current = try selected(a, &session);
    try std.testing.expectEqual(@as(?u32, 1234), current.owner.cell.width);
    try std.testing.expectEqual(@as(?u32, 5678), current.owner.cell.height);
}
