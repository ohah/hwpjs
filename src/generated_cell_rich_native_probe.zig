//! Prepared generated-cell lifecycle; Native execution requires a new grant.
const std = @import("std");
const a = std.testing.allocator;
const formatting = @import("model/formatting_patch.zig");
fn patch() formatting.Patch {
    var value: formatting.Patch = .{ .character = .{ .underline_kind = .bottom, .strike_enabled = true, .text_color = 0, .bold = false, .italic = false } };
    for (&value.fonts) |*font| font.* = .{ .name = "Generated Native Font" };
    return value;
}
fn h5Options() @import("hwp5/edit/created_table_records.zig").Options {
    return .{ .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "Generated rich" }, .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } }, .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } } };
}
test "generated cell rich H5 pending canonical runs save reopen and exact owned history" {
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    const input = try @import("new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
    var ids = try session.planTableIds(1);
    defer ids.deinit(a);
    var table = try @import("model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    try std.testing.expect(try table.replaceText(a, 0, 0, "AB", 100));
    try session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &table, .options = h5Options() } });
    session.enableHistoryDelta();
    var history = try @import("hwp5/edit/editor_history.zig").History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    const before = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    {
        var context: @import("hwp5/edit/style_preservation.zig").FormattingBatch = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expectError(error.InvalidTableCell, history.apply(session, .{ .splice_created_cell = .{ .section = 0, .identity = ids.identity, .row = 1, .column = 0, .start = 2, .end = 2, .text = "X", .insertion = patch() } }));
    }
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    const rejected = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(rejected.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, rejected.bytes);
    {
        var context: @import("hwp5/edit/style_preservation.zig").FormattingBatch = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expect(try history.apply(session, .{ .splice_created_cell = .{ .section = 0, .identity = ids.identity, .row = 0, .column = 0, .start = 2, .end = 2, .text = "한😀", .insertion = patch() } }));
    }
    const rich = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(rich.bytes);
    {
        var context: @import("hwp5/edit/style_preservation.zig").FormattingBatch = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expect(try history.apply(session, .{ .splice_created_cell = .{ .section = 0, .identity = ids.identity, .row = 0, .column = 0, .start = 5, .end = 5, .text = "D" } }));
    }
    const snapshots = try session.createdTables(a, 0);
    defer @import("hwp5/edit/created_table_snapshot.zig").deinit(a, snapshots);
    try std.testing.expectEqual(@as(usize, 1), snapshots.len);
    const cell = snapshots[0].table.cells[0];
    try std.testing.expectEqualStrings("AB한😀D", cell.text);
    try std.testing.expectEqual(@as(usize, 3), cell.character_runs.len);
    try std.testing.expectEqual(@as(u32, 2), cell.character_runs[1].start_unit);
    try std.testing.expectEqual(@as(u32, 6), cell.character_runs[2].start_unit);
    const inserted_id = cell.character_runs[1].char_shape_id;
    try std.testing.expect(inserted_id != table.resources.character);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const bindings = try reopened.tableBindings(a, 0);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 1), bindings.len);
    const ranges = try reopened.characterRanges(a, 0, bindings[0].paragraph);
    defer a.free(ranges);
    var found = false;
    for (ranges) |range| if (range.start_unit == 2 and range.end_unit == 6) {
        try std.testing.expectEqual(@as(?u32, inserted_id), range.char_shape_id);
        found = true;
    };
    try std.testing.expect(found);
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    const shape = shapes[inserted_id];
    const decoration = @import("hwp5/edit/character_decoration_compat.zig").resolve(shape);
    try std.testing.expectEqual(@as(u2, 1), decoration.underline_kind);
    try std.testing.expectEqual(@as(?bool, true), decoration.strike_enabled);
    try std.testing.expectEqual(@as(u32, 0), shape.text_color_raw);
    const faces = try reopened.fontFaces(a);
    defer @import("model/font_face_value.zig").deinit(a, faces);
    for (shape.font_ids, 0..) |id, language| {
        var matched = false;
        for (faces) |face| if (@backingInt(face.language) == language and face.id == id) {
            try std.testing.expectEqualStrings("Generated Native Font", face.name.?);
            matched = true;
        };
        try std.testing.expect(matched);
    }
    try std.testing.expect(try history.undo(session));
    const undone_d = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone_d.bytes);
    try std.testing.expectEqualSlices(u8, rich.bytes, undone_d.bytes);
    try std.testing.expect(try history.undo(session));
    const undone_rich = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone_rich.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, undone_rich.bytes);
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "generated cell rich HX pending canonical runs save reopen and exact owned history" {
    const editor = @import("hwpx/editor_session.zig");
    const input = try @import("new_document/root.zig").hwpx(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraphAnchored(0, 1, 0, 0));
    var table = try @import("hwpx/created_table_prepare.zig").prepare(&session, 0, 2, 0, 1, 1, 18000, 1800, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    try std.testing.expect(try table.replaceText(a, 0, 0, "AB", 100));
    try std.testing.expect(try @import("hwpx/created_table_session.zig").stage(&session, 0, 2, 0, &table));
    session.history_delta_managed = true; // Same managed flag as normal hwpx_edit enable.
    var history = try @import("hwpx/editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    const before = try session.save();
    defer a.free(before);
    const insertion = patch();
    {
        var context: @import("hwpx/formatting_batch_context.zig").Context = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expectError(error.InvalidTableCell, history.apply(&session, .{ .kind = .splice_created_cell, .section = 0, .paragraph = 0, .start = 2, .deleted = 0, .inserted = "X", .created_table_identity = table.identity, .created_cell = .{ 1, 0 }, .created_cell_insertion = &insertion }));
    }
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    const rejected = try session.save();
    defer a.free(rejected);
    try std.testing.expectEqualSlices(u8, before, rejected);
    {
        var context: @import("hwpx/formatting_batch_context.zig").Context = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expect(try history.apply(&session, .{ .kind = .splice_created_cell, .section = 0, .paragraph = 0, .start = 2, .deleted = 0, .inserted = "한😀", .created_table_identity = table.identity, .created_cell = .{ 0, 0 }, .created_cell_insertion = &insertion }));
    }
    const rich = try session.save();
    defer a.free(rich);
    {
        var context: @import("hwpx/formatting_batch_context.zig").Context = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expect(try history.apply(&session, .{ .kind = .splice_created_cell, .section = 0, .paragraph = 0, .start = 5, .deleted = 0, .inserted = "D", .created_table_identity = table.identity, .created_cell = .{ 0, 0 } }));
    }
    const snapshots = try @import("hwpx/created_table_snapshot.zig").read(a, &session, 0);
    defer @import("model/created_table_snapshot.zig").deinit(a, snapshots);
    const cell = snapshots[0].cells[0];
    try std.testing.expectEqualStrings("AB한😀D", cell.text);
    try std.testing.expectEqual(@as(usize, 3), cell.character_runs.len);
    const inserted_id = cell.character_runs[1].char_shape_id;
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const bindings = try @import("hwpx/table_display_bindings.zig").read(a, &reopened, 0);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 1), bindings.len);
    const paragraph = bindings[0].paragraph;
    const spans = try @import("hwpx/character_style_snapshot.zig").read(&reopened, 0, paragraph);
    defer a.free(spans);
    var found = false;
    for (spans) |span| if (span.start_unit == 2 and span.end_unit == 6) {
        try std.testing.expectEqual(@as(?u32, inserted_id), span.char_shape_id);
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expect(!try reopened.setCharacterProperties(0, paragraph, 2, 6, insertion.character));
    for (0..7) |language| try std.testing.expect(!try reopened.setCharacterFontName(0, paragraph, 2, 6, @fromBackingInt(@intCast(language)), "Generated Native Font"));
    const text = try reopened.anchorText(0, paragraph);
    defer a.free(text);
    try std.testing.expectEqualStrings("AB한😀D", text);
    try std.testing.expect(try history.undo(&session));
    const undone_d = try session.save();
    defer a.free(undone_d);
    try std.testing.expectEqualSlices(u8, rich, undone_d);
    try std.testing.expect(try history.undo(&session));
    const undone_rich = try session.save();
    defer a.free(undone_rich);
    try std.testing.expectEqualSlices(u8, before, undone_rich);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "generated cell rich clone grid and detached snapshot keep a single canonical paragraph map" {
    const created = @import("model/created_table.zig");
    var table = try created.create(a, 1, 1, try @import("model/table_creation_plan.zig").create(1, 1, 100, 100, 4), &.{1}, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
    defer table.deinit(a);
    try std.testing.expect(try table.cells[0].splice(a, 0, 0, 0, "A😀", 7, 1000));
    var copy = try table.clone(a);
    defer copy.deinit(a);
    var grid = try @import("model/created_table_grid.zig").edit(a, &copy, .{ .insert_row = 1 }, &.{2}, .{ .max_cells = 4, .max_text_bytes = 1000 });
    defer grid.deinit(a);
    try std.testing.expectEqualDeep(table.cells[0], grid.cells[0]);
    var snapshot = try @import("model/created_table_snapshot.zig").fromTable(a, &grid, 1, 0);
    defer snapshot.deinit(a);
    try std.testing.expectEqualStrings("A😀", snapshot.cells[0].text);
    try std.testing.expectEqualDeep(@as([]const @import("model/document.zig").CharacterRun, &.{ .{ .start_unit = 0, .char_shape_id = 7 }, .{ .start_unit = 3, .char_shape_id = 0 } }), snapshot.cells[0].character_runs);
    try std.testing.expect(try grid.cells[0].splice(a, 0, 0, 1, "B", 8, 1000));
    try std.testing.expectEqualStrings("A😀", table.cells[0].text);
    try std.testing.expectEqualStrings("A😀", snapshot.cells[0].text);
}

comptime {
    _ = @import("model/authored_paragraph.zig");
}
