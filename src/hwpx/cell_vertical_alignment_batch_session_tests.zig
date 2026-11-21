const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const Command = @import("editor_history.zig").Command;
const batch = @import("cell_vertical_alignment_batch_plan.zig");
const capture = @import("../testing/original_cell_block_capture.zig");
const fixture = @import("cell_vertical_alignment_batch_fixture.zig");
fn witness(selected: capture.Capture) batch.Witness {
    return .{ .section = 0, .table_node = selected.table, .selection = selected.selection };
}
fn command(request: *const batch.Request) Command {
    return .{ .kind = .cell_vertical_alignment_block, .section = request.before.section, .paragraph = request.before.entries[0].paragraphs[0], .start = 0, .deleted = 0, .inserted = "", .cell_vertical_alignment_block = request };
}
test "original cell block HX session one parked entry exact undo redo and unselected source" {
    const a = std.testing.allocator;
    const input = try fixture.make(a, .plain);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const selected = try capture.hx(a, &session);
    defer selected.deinit(a);
    const baseline = try session.save();
    defer a.free(baseline);
    const old_rows = try @import("table_display_bindings.zig").read(a, &session, 0);
    defer a.free(old_rows);
    const old_node = session.sections[0].tree.elements[old_rows[2].owner.cell_node];
    const untouched = try a.dupe(u8, session.sections[0].tree.source[old_node.start_tag.start..old_node.end]);
    defer a.free(untouched);
    var before = try history.cellVerticalAlignmentBlock(&session, a, witness(selected));
    defer before.deinit(a);
    const request: batch.Request = .{ .before = before, .revision = history.revision(), .value = .center };
    try std.testing.expect(try history.apply(&session, command(&request)));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const saved = try session.save();
    defer a.free(saved);
    const new_rows = try @import("table_display_bindings.zig").read(a, &session, 0);
    defer a.free(new_rows);
    const new_node = session.sections[0].tree.elements[new_rows[2].owner.cell_node];
    try std.testing.expectEqualSlices(u8, untouched, session.sections[0].tree.source[new_node.start_tag.start..new_node.end]);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const fresh = try capture.hx(a, &reopened);
    defer fresh.deinit(a);
    var observed = try batch.observe(a, &reopened, witness(fresh), before.ticket);
    defer observed.deinit(a);
    for (observed.entries) |entry| try std.testing.expectEqual(@as(?@import("../model/cell_vertical_alignment.zig").Alignment, .center), entry.before.value);
}
test "original cell block HX session merged and multiparagraph lists remain one physical target" {
    const a = std.testing.allocator;
    for ([_]fixture.Mode{ .merged_top, .multiparagraph_first }) |mode| {
        const input = try fixture.make(a, mode);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var history = try History.initV2(&session, .{});
        defer history.deinit();
        const selected = try capture.hx(a, &session);
        defer selected.deinit(a);
        var before = try history.cellVerticalAlignmentBlock(&session, a, witness(selected));
        defer before.deinit(a);
        try std.testing.expectEqual(@as(usize, if (mode == .merged_top) 1 else 2), before.entries.len);
        if (mode == .multiparagraph_first) try std.testing.expectEqual(@as(usize, 2), before.entries[0].paragraphs.len);
        const baseline = try session.save();
        defer a.free(baseline);
        const request: batch.Request = .{ .before = before, .revision = history.revision(), .value = .bottom };
        try std.testing.expect(try history.apply(&session, command(&request)));
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, baseline, undone);
    }
}
test "original cell block HX session final protected unknown value refuse all selected cells" {
    const a = std.testing.allocator;
    for ([_]fixture.Mode{ .protected_second, .reserved_second }) |mode| {
        const input = try fixture.make(a, mode);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var history = try History.initV2(&session, .{});
        defer history.deinit();
        const selected = try capture.hx(a, &session);
        defer selected.deinit(a);
        var before = try history.cellVerticalAlignmentBlock(&session, a, witness(selected));
        defer before.deinit(a);
        const baseline = try session.save();
        defer a.free(baseline);
        const request: batch.Request = .{ .before = before, .revision = history.revision(), .value = .bottom };
        if (mode == .protected_second) try std.testing.expectError(error.CellVerticalAlignmentReadOnly, history.apply(&session, command(&request))) else try std.testing.expectError(error.UnsupportedCellVerticalAlignment, history.apply(&session, command(&request)));
        try std.testing.expectEqual(@as(u32, 0), history.revision());
        const after = try session.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, baseline, after);
    }
}
test "original cell block HX session noop stale and V1 retain valid redo" {
    const a = std.testing.allocator;
    const input = try fixture.make(a, .plain);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const selected = try capture.hx(a, &session);
    defer selected.deinit(a);
    var before = try history.cellVerticalAlignmentBlock(&session, a, witness(selected));
    defer before.deinit(a);
    const request: batch.Request = .{ .before = before, .revision = history.revision(), .value = .bottom };
    try std.testing.expect(try history.apply(&session, command(&request)));
    const expected = try session.save();
    defer a.free(expected);
    try std.testing.expect(try history.undo(&session));
    const current = try capture.hx(a, &session);
    defer current.deinit(a);
    var fresh = try history.cellVerticalAlignmentBlock(&session, a, witness(current));
    defer fresh.deinit(a);
    const noop: batch.Request = .{ .before = fresh, .revision = history.revision(), .value = .top };
    try std.testing.expect(!try history.apply(&session, command(&noop)));
    try std.testing.expectError(error.StaleCellVerticalAlignment, history.apply(&session, command(&request)));
    try std.testing.expect(try history.redo(&session));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, expected, after);
    var other = try editor.open(a, input, .{});
    defer other.deinit();
    var legacy = try History.init(&other, 4, 4000000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(&other, command(&request)));
}
test "original cell block HX session pending size survives current save mapping and one undo" {
    const a = std.testing.allocator;
    const input = try fixture.make(a, .plain);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const selected = try capture.hx(a, &session);
    defer selected.deinit(a);
    const rows = try @import("table_display_bindings.zig").read(a, &session, 0);
    defer a.free(rows);
    try std.testing.expect(try history.apply(&session, .{ .kind = .cell_size, .section = 0, .paragraph = rows[0].paragraph, .start = 0, .deleted = 0, .inserted = "", .list_node = rows[0].owner.list_node, .cell_size = .{ .width = 1234, .height = 5678 } }));
    const baseline = try session.save();
    defer a.free(baseline);
    var before = try history.cellVerticalAlignmentBlock(&session, a, witness(selected));
    defer before.deinit(a);
    const request: batch.Request = .{ .before = before, .revision = history.revision(), .value = .bottom };
    try std.testing.expect(try history.apply(&session, command(&request)));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
}
