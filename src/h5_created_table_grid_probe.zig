//! Focused Native generated-table grid verification entrypoint.
comptime {
    _ = @import("hwp5/edit/created_table_grid_session_tests.zig");
}

const std = @import("std");
const contract = @import("hwp5/edit/created_table_grid_session_tests.zig");
const grid = @import("model/created_table_grid.zig");
const Session = @import("hwp5/edit/style_preservation.zig").Session;
const History = @import("hwp5/edit/editor_history.zig").History;
const snapshots = @import("hwp5/edit/created_table_snapshot.zig");
const a = std.testing.allocator;
const budget = 64 * 1024 * 1024;
fn savedEqual(session: *const Session, expected: []const u8) !void {
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, expected, saved.bytes);
}
fn nooriCase(input: []const u8, command: grid.Command, v2: bool) !void {
    const session = try Session.open(a, input);
    defer session.close();
    var ids = try session.planTableIdsWithAllocator(a, 4);
    defer ids.deinit(a);
    var table = try contract.table(a, ids.identity, ids.instance_id, ids.paragraph_ids);
    defer table.deinit(a);
    try session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 0, .table = &table, .options = contract.options } });
    const before = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    var history = if (v2) try History.initV2(a, session, .{}) else try History.init(a, session, 8, budget);
    defer history.deinit();
    const revision = history.revision();
    try std.testing.expect(try history.apply(session, .{ .edit_created_table_grid = .{ .section = 0, .table = ids.identity, .command = command } }));
    try std.testing.expect(history.revision() != revision);
    if (!v2) try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    const rows = try session.createdTables(a, 0);
    defer snapshots.deinit(a, rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    const current = rows[0].table;
    try std.testing.expectEqual(ids.instance_id, current.instance_id);
    try std.testing.expectEqualDeep(contract.options, rows[0].options);
    const row_edit = switch (command) {
        .insert_row, .delete_row => true,
        else => false,
    };
    const insert = switch (command) {
        .insert_row, .insert_column => true,
        else => false,
    };
    const index = switch (command) {
        inline else => |i| i,
    };
    try std.testing.expectEqual(@as(u32, if (row_edit) (if (insert) 3 else 1) else 2), current.rows);
    try std.testing.expectEqual(@as(u32, if (!row_edit) (if (insert) 3 else 1) else 2), current.columns);
    for (current.cells) |cell| {
        const coordinate = if (row_edit) cell.row else cell.column;
        if (insert and coordinate == index) {
            try std.testing.expectEqualStrings("", cell.text);
            for (ids.paragraph_ids) |old_id| try std.testing.expect(cell.paragraph_id != old_id);
        } else {
            const prior = if (insert) coordinate - @intFromBool(coordinate > index) else coordinate + @intFromBool(coordinate >= index);
            const offset = if (row_edit) prior * 2 + cell.column else cell.row * 2 + prior;
            try std.testing.expectEqual(ids.paragraph_ids[offset], cell.paragraph_id);
            try std.testing.expectEqualStrings(contract.texts[offset], cell.text);
        }
        const text = try session.copyCreatedCellUtf8(a, .{ .section = 0, .table = ids.identity, .row = cell.row, .column = cell.column });
        defer a.free(text);
        try std.testing.expectEqualStrings(cell.text, text);
    }
    const after = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expect(after.layout_requires_reflow);
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const reopened = try Session.open(a, after.bytes);
    defer reopened.close();
    var source = try @import("hwp5/text_source.zig").Source.open(a, after.bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var it = @import("hwp5/record.zig").Iterator.init(raw, .{});
    var target_level: ?u10 = null;
    var wire_tables: usize = 0;
    while (try it.next()) |record| {
        if (target_level) |level| if (record.level <= level) {
            target_level = null;
        };
        if (record.tag == 71) {
            const control = try @import("hwp5/body/control_header.zig").Header.parse(record.payload);
            if (control.id == @import("hwp5/body/control_rules.zig").table_id) {
                const properties = try @import("hwp5/body/object_common.zig").parseControl(control);
                if (properties.instance_id == ids.instance_id) {
                    target_level = record.level;
                    try std.testing.expectEqual(current.width, properties.width);
                    try std.testing.expectEqual(current.height, properties.height);
                }
            }
        } else if (record.tag == 77 and target_level != null) {
            const wire = try @import("hwp5/body/table.zig").Table.parse(record.payload, source.header.version());
            wire_tables += 1;
            try std.testing.expectEqual(current.rows, wire.row_count);
            try std.testing.expectEqual(current.columns, wire.column_count);
        }
    }
    try std.testing.expectEqual(@as(usize, 1), wire_tables);
    var projected = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer projected.deinit(a);
    for (current.cells) |cell| {
        var found: usize = 0;
        for (projected.sections[0].paragraphs, 0..) |p, pi| {
            if (p.instance_id != cell.paragraph_id) continue;
            found += 1;
            const text = try reopened.copyText(a, 0, pi);
            defer a.free(text);
            const expected = try std.mem.concat(a, u8, &.{ cell.text, "\r" });
            defer a.free(expected);
            const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, expected);
            defer a.free(utf16);
            try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(utf16), text);
        }
        try std.testing.expectEqual(@as(usize, 1), found);
    }
    try std.testing.expect(try history.undo(session));
    try savedEqual(session, before.bytes);
    try std.testing.expect(!try history.undo(session));
    const redo_revision = history.revision();
    // Rejected commands must leave both saved bytes and the redo branch intact.
    for ([_]@import("hwp5/edit/created_table_grid_session.zig").Edit{
        .{ .section = 0, .table = 0, .command = .{ .delete_row = 0 } },
        .{ .section = 0, .table = ids.identity, .command = .{ .insert_column = 99 } },
    }) |bad| {
        if (history.apply(session, .{ .edit_created_table_grid = bad })) |_| return error.ExpectedRefusal else |_| {}
        try std.testing.expectEqual(redo_revision, history.revision());
        try savedEqual(session, before.bytes);
    }
    try std.testing.expect(try history.redo(session));
    try savedEqual(session, after.bytes);
    try std.testing.expect(!try history.redo(session));
}
test "HWP5 created table grid Noori native four commands mapping saved IDs reopen single undo redo" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "/Users/yoonhb/Documents/workspace/hwpjs/apps/docs/docs/public/editor/fixtures/noori.hwp", a, .limited(budget));
    defer a.free(input);
    for ([_]grid.Command{
        .{ .insert_row = 0 },    .{ .insert_row = 1 },    .{ .insert_row = 2 },
        .{ .insert_column = 0 }, .{ .insert_column = 1 }, .{ .insert_column = 2 },
        .{ .delete_row = 0 },    .{ .delete_row = 1 },    .{ .delete_column = 0 },
        .{ .delete_column = 1 },
    }) |command| try nooriCase(input, command, false);
    try nooriCase(input, .{ .insert_column = 1 }, true);
}
