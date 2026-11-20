//! Common modern factory -> create/save -> reopened physical source table.
const std = @import("std");
const a = std.testing.allocator;
const root = @import("root.zig");
const edit = @import("../hwp5/edit/style_preservation.zig");
const History = @import("../hwp5/edit/editor_history.zig").History;
const raw = @import("hwp5_profile_grid_oracle.zig");
const creationOptions = @import("hwp5_profile_test_options.zig").creationOptions;

test "new document modern default saved source table all row column edits undo redo" {
    const initial = try root.hwp5(a);
    defer a.free(initial);
    const creator = try edit.Session.open(a, initial);
    defer creator.close();
    var ids = try creator.planTableIdsWithAllocator(a, 4);
    defer ids.deinit(a);
    var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(2, 2, 18000, 1800, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
    defer table.deinit(a);
    const original = [_][]const u8{ "A😀", "B", "C", "D" };
    for (original, 0..) |text, index| _ = try table.replaceText(a, @intCast(index / 2), @intCast(index % 2), text, 100);
    var creation_history = try History.initV2(a, creator, .{});
    defer creation_history.deinit();
    try std.testing.expect(try creation_history.apply(creator, .{ .stage_table = .{
        .section = 0,
        .paragraph = 0,
        .unit = 16,
        .table = &table,
        .options = creationOptions(),
    } }));
    const created = try creator.save(a, .{ .allow_stale_layout = true });
    defer a.free(created.bytes);
    try raw.inspectSourceGrid(created.bytes, 2, 2, &original);
    // The target is now an original physical table from a freshly opened file,
    // not a pending generated-table entry or reused transaction identity.
    const session = try edit.Session.open(a, created.bytes);
    defer session.close();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const Step = struct {
        command: @import("../model/table_grid_edit_plan.zig").Command,
        before_rows: u32,
        before_columns: u32,
        rows: usize,
        columns: usize,
        matrix: []const []const u8,
    };
    const steps = [_]Step{
        .{ .command = .{ .insert_row = 1 }, .before_rows = 2, .before_columns = 2, .rows = 3, .columns = 2, .matrix = &.{ "A😀", "B", "", "", "C", "D" } },
        .{ .command = .{ .insert_column = 1 }, .before_rows = 3, .before_columns = 2, .rows = 3, .columns = 3, .matrix = &.{ "A😀", "", "B", "", "", "", "C", "", "D" } },
        .{ .command = .{ .delete_row = 1 }, .before_rows = 3, .before_columns = 3, .rows = 2, .columns = 3, .matrix = &.{ "A😀", "", "B", "C", "", "D" } },
        .{ .command = .{ .delete_column = 1 }, .before_rows = 2, .before_columns = 3, .rows = 2, .columns = 2, .matrix = &.{ "A😀", "B", "C", "D" } },
    };
    for (steps) |step| {
        const before = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(before.bytes);
        const revision = history.revision();
        try std.testing.expect(try history.apply(session, .{ .edit_source_table_grid = .{
            .section = 0,
            .table_node = try raw.onlyTableNode(before.bytes),
            .expected_rows = step.before_rows,
            .expected_columns = step.before_columns,
            .command = step.command,
            .layout = .observed8,
        } }));
        try std.testing.expectEqual(revision + 1, history.revision());
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try raw.inspectSourceGrid(saved.bytes, step.rows, step.columns, step.matrix);
        try raw.unchangedNonBodyStreams(created.bytes, saved.bytes);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        try std.testing.expectEqual(@as(u32, 0x05000300), reopened.fileVersion());
        try std.testing.expectEqual(step.matrix.len + 1, try reopened.paragraphCount(0));
        const repeated = try reopened.save(a, .{ .allow_stale_layout = true });
        defer a.free(repeated.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, repeated.bytes);
        try std.testing.expect(try history.undo(session));
        const undone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(undone.bytes);
        try std.testing.expectEqualSlices(u8, before.bytes, undone.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    }
}
