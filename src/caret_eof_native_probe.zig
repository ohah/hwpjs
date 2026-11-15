//! Source-only prepared regression. Do not compile without the separate slot grant.
const std = @import("std");
const a = std.testing.allocator;
const runs = @import("hwp5/edit/character_runs.zig");
const Run = @import("model/document.zig").CharacterRun;
const Session = @import("hwp5/edit/style_preservation.zig").Session;
fn style(rows: []const Run, unit: u32) u32 {
    var result = rows[0].char_shape_id;
    for (rows) |row| {
        if (row.start_unit > unit) break;
        result = row.char_shape_id;
    }
    return result;
}
test "caret EOF real terminator excludes control payload and empty paragraphs" {
    try std.testing.expectEqual(@as(?u32, 3), try runs.visibleTextEnd(&.{ 'A', 0, 'B', 0, 'C', 0, 13, 0 }));
    try std.testing.expectEqual(@as(?u32, null), try runs.visibleTextEnd(&.{ 13, 0 }));
    // A CR-valued payload is consumed by the official owned token parser.
    const control = [_]u8{ 9, 0, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13, 0, 9, 0 };
    try std.testing.expectEqual(@as(?u32, null), try runs.visibleTextEnd(&control));
    const control_then_cr = control ++ [_]u8{ 13, 0 };
    try std.testing.expectEqual(@as(?u32, null), try runs.visibleTextEnd(&control_then_cr));
    const control_text_cr = control ++ [_]u8{ 'A', 0, 13, 0 };
    try std.testing.expectEqual(@as(?u32, 9), try runs.visibleTextEnd(&control_text_cr));
    try std.testing.expectError(error.InvalidControlTerminator, runs.visibleTextEnd(&.{ 9, 0, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 13, 0 }));
}
test "caret EOF only pure terminal insertion changes affinity and retains CR and explicit ID" {
    const rows = [_]Run{ .{ .start_unit = 0, .char_shape_id = 5 }, .{ .start_unit = 1, .char_shape_id = 7 }, .{ .start_unit = 3, .char_shape_id = 1 } };
    try std.testing.expectEqual(@as(?u32, 7), runs.typingInsertionId(&rows, 3, 3, 3, 1));
    try std.testing.expectEqual(@as(?u32, null), runs.typingInsertionId(&rows, 3, 1, 1, 1));
    try std.testing.expectEqual(@as(?u32, null), runs.typingInsertionId(&rows, 3, 1, 3, 1));
    try std.testing.expectEqual(@as(?u32, null), runs.typingInsertionId(&rows, 3, 3, 3, 0));
    const appended = try runs.replace(a, &rows, 3, 3, 1, runs.typingInsertionId(&rows, 3, 3, 3, 1));
    defer a.free(appended);
    try std.testing.expectEqual(@as(u32, 7), style(appended, 3));
    try std.testing.expectEqual(@as(u32, 1), style(appended, 4));
    const interior = try runs.replace(a, &rows, 1, 1, 1, null);
    defer a.free(interior);
    try std.testing.expectEqual(@as(u32, 7), style(interior, 1));
    const explicit = try runs.replace(a, &rows, 3, 3, 1, 9);
    defer a.free(explicit);
    try std.testing.expectEqual(@as(u32, 9), style(explicit, 3));
    try std.testing.expectEqual(@as(u32, 1), style(explicit, 4));
    const selected = try runs.replace(a, &rows, 1, 3, 1, null);
    defer a.free(selected);
    try std.testing.expectEqual(@as(u32, 7), style(selected, 1));
    try std.testing.expectEqual(@as(u32, 1), style(selected, 2));
}
test "caret EOF bulk retains right boundary replacement and one forward run cursor" {
    const rows = [_]Run{ .{ .start_unit = 0, .char_shape_id = 5 }, .{ .start_unit = 1, .char_shape_id = 7 }, .{ .start_unit = 3, .char_shape_id = 1 } };
    var visits: usize = 0;
    const edited = try runs.replaceIndependent(a, &rows, &.{ .{ .start = 1, .end = 2, .added = 2 }, .{ .start = 3, .end = 3, .added = 1, .insertion_id = runs.typingInsertionId(&rows, 3, 3, 3, 1) } }, &visits);
    defer a.free(edited);
    try std.testing.expectEqual(@as(u32, 7), style(edited, 1));
    try std.testing.expectEqual(@as(u32, 7), style(edited, 4));
    try std.testing.expectEqual(@as(u32, 1), style(edited, 5));
    try std.testing.expect(visits <= rows.len);
}
fn richHistory(input: []const u8, host: @import("hwp5/edit/paragraph_flow_host.zig").Host, current_reference: bool) !void {
    const session = try Session.open(a, input);
    defer session.close();
    const flows = try session.paragraphFlow(a, 0);
    defer a.free(flows);
    var paragraph: ?usize = null;
    for (flows) |flow| if (flow.host == host) {
        paragraph = flow.paragraph;
        break;
    };
    const index = paragraph orelse return error.TestOwnerNotFound;
    const start = try session.editableTextLength(a, 0, index);
    var history = try @import("hwp5/edit/editor_history.zig").History.initV2(a, session, .{ .max_entries = 16 });
    defer history.deinit();
    for ("ABC", 0..) |_, i| {
        const at = start + @as(u32, @intCast(i));
        const commands = try @import("wasm/character_property_text_commands.zig").buildRich(.hwp5, a, .{ .section = 0, .paragraph = index, .start = at, .end = at, .text = "ABC"[i..][0..1] }, .{ .character = .{ .underline_kind = .bottom, .strike_enabled = true } });
        defer a.free(commands);
        var context: @import("hwp5/edit/style_preservation.zig").FormattingBatch = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expect(try history.applyBatch(session, commands));
    }
    const abc = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(abc.bytes);
    for (0..3) |_| try std.testing.expect(try history.undo(session));
    for (0..3) |_| try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, abc.bytes, redone.bytes);
    const eof = start + 3;
    // Fresh native owner lookup models cursor re-selection; no retained typing patch.
    const command: @import("hwp5/edit/style_preservation.zig").Command = if (current_reference)
        .{ .splice_current_paragraph = .{ .section = 0, .reference = try session.currentSourceParagraphReference(0, index), .start_unit = eof, .end_unit = eof, .utf8 = "D" } }
    else
        .{ .splice_text = .{ .section = 0, .paragraph = index, .start_unit = eof, .end_unit = eof, .utf8 = "D" } };
    try std.testing.expect(try history.apply(session, command));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const ranges = try reopened.characterRanges(a, 0, index);
    defer a.free(ranges);
    var c_id: ?u32 = null;
    var d_id: ?u32 = null;
    for (ranges) |range| {
        if (range.start_unit <= eof - 1 and range.end_unit > eof - 1) c_id = range.char_shape_id;
        if (range.start_unit <= eof and range.end_unit > eof) d_id = range.char_shape_id;
    }
    try std.testing.expect(c_id != null and d_id != null);
    try std.testing.expectEqual(c_id, d_id);
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    const decoration = @import("hwp5/edit/character_decoration_compat.zig").resolve(shapes[d_id.?]);
    try std.testing.expectEqual(@as(u2, 1), decoration.underline_kind);
    try std.testing.expectEqual(@as(?bool, true), decoration.strike_enabled);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, abc.bytes, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone_d = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone_d.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone_d.bytes);
}
test "caret EOF original H5 cell redo and fresh current owner inherit saved visible style" {
    try richHistory(@embedFile("caret_eof_fixtures/table.hwp"), .table_cell, true);
}
test "caret EOF H5 body redo inherits visible style in ordinal history entry" {
    try richHistory(@embedFile("caret_eof_fixtures/table.hwp"), .body, false);
}
test "caret EOF original H5 GSO textbox redo and fresh owner preserve saved underline strike" {
    try richHistory(@embedFile("caret_eof_fixtures/textbox.hwp"), .drawing, true);
}

test "caret EOF implicit empty original cell retains its observed default resource" {
    const session = try Session.open(a, @embedFile("caret_eof_fixtures/table.hwp"));
    defer session.close();
    const raw = try session.copyText(a, 0, 1);
    defer a.free(raw);
    try std.testing.expectEqual(@as(usize, 0), raw.len);
    try std.testing.expectEqual(@as(u32, 0), try session.editableTextLength(a, 0, 1));
    const before = try session.characterRanges(a, 0, 1);
    defer a.free(before);
    const initial = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(initial.bytes);
    var history = try @import("hwp5/edit/editor_history.zig").History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "D" } }));
    const after = try session.characterRanges(a, 0, 1);
    defer a.free(after);
    try std.testing.expectEqual(before[0].char_shape_id, after[0].char_shape_id);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, initial.bytes, undone.bytes);
}

test "caret EOF detached run edits preserve original boundaries on allocation failure" {
    const original = [_]Run{ .{ .start_unit = 0, .char_shape_id = 5 }, .{ .start_unit = 3, .char_shape_id = 1 } };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, rows: []const Run) !void {
            const insertion_id = runs.typingInsertionId(rows, 3, 3, 3, 1);
            const after = try runs.replace(allocator, rows, 3, 3, 1, insertion_id);
            defer allocator.free(after);
            try std.testing.expectEqual(@as(u32, 5), style(after, 3));
            try std.testing.expectEqual(@as(u32, 1), style(after, 4));
            try std.testing.expectEqual(@as(u32, 3), rows[1].start_unit);
            try std.testing.expectEqual(@as(u32, 1), rows[1].char_shape_id);
        }
    }.run, .{&original});
}
