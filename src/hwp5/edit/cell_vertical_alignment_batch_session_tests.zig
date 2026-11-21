const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const batch = @import("cell_vertical_alignment_batch_plan.zig");
const capture = @import("../../testing/original_cell_block_capture.zig");
fn witness(selected: capture.Capture) batch.Witness {
    return .{ .section = 0, .table_node = @intCast(selected.table), .selection = selected.selection };
}
test "original cell block H5 session one rebase one undo redo full current saved bytes" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const selected = try capture.h5(a, session);
    defer selected.deinit(a);
    const baseline = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    var before = try session.cellVerticalAlignmentBlock(a, witness(selected));
    defer before.deinit(a);
    try std.testing.expect(try history.apply(session, .{ .set_cell_vertical_alignment_block = .{ .before = before, .value = .center } }));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    var after = try session.cellVerticalAlignmentBlock(a, witness(selected));
    defer after.deinit(a);
    for (after.entries) |entry| try std.testing.expectEqual(@as(?@import("../../model/cell_vertical_alignment.zig").Alignment, .center), entry.value);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, baseline.bytes, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const rows = try reopened.cellLayoutSources(a, 0);
    defer a.free(rows);
    var changed: usize = 0;
    for (rows) |row| {
        var targeted = false;
        for (selected.selection.cells) |cell| if (cell.list_node == row.list_node) {
            targeted = true;
        };
        if (targeted) {
            try std.testing.expectEqual(@as(u2, 1), row.vertical_alignment);
            changed += 1;
        }
    }
    try std.testing.expectEqual(selected.selection.cells.len, changed);
}
test "original cell block H5 session noop stale direct paths and V1 retain prior redo" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const selected = try capture.h5(a, session);
    defer selected.deinit(a);
    var before = try session.cellVerticalAlignmentBlock(a, witness(selected));
    defer before.deinit(a);
    try std.testing.expect(try history.apply(session, .{ .set_cell_vertical_alignment_block = .{ .before = before, .value = .bottom } }));
    const expected = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(expected.bytes);
    try std.testing.expect(try history.undo(session));
    var fresh = try session.cellVerticalAlignmentBlock(a, witness(selected));
    defer fresh.deinit(a);
    const cmd: edit.Command = .{ .set_cell_vertical_alignment_block = .{ .before = fresh, .value = .center } };
    const revision = history.revision();
    const token = try session.historyTicket();
    try std.testing.expectError(error.HistoryProtocol2Required, session.apply(cmd));
    try std.testing.expectError(error.HistoryProtocol2Required, session.applyWithFontCache(cmd, null));
    const checkpoint = try session.createCheckpoint(4000000);
    defer checkpoint.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, session.applyCheckpointed(checkpoint, 4000000, cmd));
    try std.testing.expectError(error.HistoryProtocol2Required, session.applyBatchCheckpointed(checkpoint, 4000000, &.{cmd}));
    try std.testing.expectEqualDeep(token, try session.historyTicket());
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expect(!try history.apply(session, .{ .set_cell_vertical_alignment_block = .{ .before = fresh, .value = .top } }));
    try std.testing.expectError(error.StaleMutationEpoch, history.apply(session, .{ .set_cell_vertical_alignment_block = .{ .before = before, .value = .center } }));
    try std.testing.expect(try history.redo(session));
    const actual = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(actual.bytes);
    try std.testing.expectEqualSlices(u8, expected.bytes, actual.bytes);
    const other = try edit.Session.open(a, input);
    defer other.close();
    var legacy = try History.init(a, other, 4, 4000000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(other, cmd));
}
test "original cell block H5 session pending size intents survive batch and undo baseline" {
    const a = std.testing.allocator;
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const selected = try capture.h5(a, session);
    defer selected.deinit(a);
    try std.testing.expect(try history.apply(session, .{ .set_cell_size = .{ .section = 0, .list_node = selected.selection.cells[0].list_node, .width = 1234, .height = 5678 } }));
    const baseline = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    var before = try session.cellVerticalAlignmentBlock(a, witness(selected));
    defer before.deinit(a);
    try std.testing.expect(try history.apply(session, .{ .set_cell_vertical_alignment_block = .{ .before = before, .value = .bottom } }));
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, baseline.bytes, undone.bytes);
}
