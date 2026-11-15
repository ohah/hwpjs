//! Test-only successor: the same product4 with actual managed/live execution.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("hwp5/edit/style_preservation.zig");
const Host = @import("hwp5/edit/paragraph_flow_host.zig").Host;

fn managed(input: []const u8, host: Host) !void {
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    try std.testing.expect(session.historyDeltaEnabled());
    const flows = try session.paragraphFlow(a, 0);
    defer a.free(flows);
    var selected: ?usize = null;
    if (host == .drawing) {
        const lists = try session.drawingListSources(a, 0);
        defer a.free(lists);
        var body_matches: usize = 0;
        var caption_matches: usize = 0;
        for (lists) |list| for (flows) |flow| {
            const parent = flow.parent_node orelse continue;
            const list_node = flow.list_node orelse continue;
            if (flow.host != .drawing or list_node != list.list_node or @as(usize, parent) != list.owner_node) continue;
            if (list.kind == .body) {
                selected = flow.paragraph;
                body_matches += 1;
            } else {
                caption_matches += 1;
                // This same fixture's first drawing flow is a picture caption
                // with a retained auto-number control, not the textbox body.
                const caption = try session.copyText(a, 0, flow.paragraph);
                defer a.free(caption);
                var tokens = try @import("hwp5/body/text.zig").Iterator.init(caption);
                var numbered = false;
                while (try tokens.next()) |token| if (token.value == .control and token.value.control.code == 18) {
                    numbered = true;
                };
                try std.testing.expect(numbered);
                const caption_reference = try session.currentSourceParagraphReference(0, flow.paragraph);
                const before_refusal = try session.save(a, .{ .allow_stale_layout = true });
                defer a.free(before_refusal.bytes);
                try std.testing.expectError(error.UnsupportedTextWindowParagraph, session.copySourceTextWindowUtf16(a, 0, caption_reference.source.host, 0, 0));
                const after_refusal = try session.save(a, .{ .allow_stale_layout = true });
                defer a.free(after_refusal.bytes);
                try std.testing.expectEqualSlices(u8, before_refusal.bytes, after_refusal.bytes);
                std.debug.print("EOF_CAPTION_NEGATIVE paragraph={d} source={d} owner={d} list={d} control=18 window=UnsupportedTextWindowParagraph bytesUnchanged=true\n", .{ flow.paragraph, flow.source_node.?, list.owner_node, list.list_node });
            }
        };
        try std.testing.expectEqual(@as(usize, 1), body_matches);
        try std.testing.expectEqual(@as(usize, 1), caption_matches);
    } else for (flows) |flow| if (flow.host == host) {
        selected = flow.paragraph;
        break;
    };
    const paragraph = selected orelse return error.RequiredSourceOwnerMissing;
    if (host == .drawing) {
        const body = try session.copyText(a, 0, paragraph);
        defer a.free(body);
        const expected = try std.unicode.utf8ToUtf16LeAlloc(a, "글상자\r");
        defer a.free(expected);
        try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected), body);
    }
    const original_bindings = try session.tableBindings(a, 0);
    defer a.free(original_bindings);
    if (host == .table_cell) {
        var found = false;
        for (original_bindings) |binding| if (binding.paragraph == paragraph and binding.row == 0 and binding.column == 0) {
            found = true;
        };
        try std.testing.expect(found);
    }
    const start = try session.editableTextLength(a, 0, paragraph);
    var history = try @import("hwp5/edit/editor_history.zig").History.initV2(a, session, .{ .max_entries = 16 });
    defer history.deinit();
    try std.testing.expect(history.owned.?.managed);
    for ("ABC", 0..) |_, i| {
        const at = start + @as(u32, @intCast(i));
        const commands = try @import("wasm/character_property_text_commands.zig").buildRich(.hwp5, a, .{ .section = 0, .paragraph = paragraph, .start = at, .end = at, .text = "ABC"[i..][0..1] }, .{ .character = .{ .underline_kind = .bottom, .strike_enabled = true } });
        defer a.free(commands);
        var context: edit.FormattingBatch = .{};
        try session.beginFormattingBatch(&context);
        defer session.endFormattingBatch(&context);
        try std.testing.expect(try history.applyBatch(session, commands));
    }
    const abc = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(abc.bytes);
    for (0..3) |_| try std.testing.expect(try history.undo(session));
    for (0..3) |_| try std.testing.expect(try history.redo(session));
    const abc_redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(abc_redone.bytes);
    try std.testing.expectEqualSlices(u8, abc.bytes, abc_redone.bytes);
    // An originally omitted text record may be inserted when ABC is first
    // saved. Native node ordinals are session-local, so compare physical IDs
    // against the saved ABC cohort, not the pre-edit file's record offsets.
    const abc_reopened = try edit.Session.open(a, abc.bytes);
    defer abc_reopened.close();
    const abc_bindings = try abc_reopened.tableBindings(a, 0);
    defer a.free(abc_bindings);
    const abc_reference = try abc_reopened.currentSourceParagraphReference(0, paragraph);

    // Real source owner is re-read after restore, never an inferred paragraph
    // ID or retained typing patch. This is the Native target of the UI's
    // current-reference ordinary splice route.
    const reference = try session.currentSourceParagraphReference(0, paragraph);
    try std.testing.expect(reference == .source and reference.source.host == .original_node);
    const eof = start + 3;
    var old_window = try session.copySourceTextWindowUtf16(a, 0, reference.source.host, eof - 1, eof + 1);
    defer old_window.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 'C', 0, 13, 0 }, old_window.bytes);
    const counters_before = history.owned.?.counters;
    const live_before = session.liveTextCounters();
    try std.testing.expect(try history.apply(session, .{ .splice_current_paragraph = .{ .section = 0, .reference = reference, .start_unit = eof, .end_unit = eof, .utf8 = "D" } }));
    const counters_after = history.owned.?.counters;
    const identity = edit.Testing.liveIdentity(session);
    const live_after = session.liveTextCounters();
    // A snapshot or non-gap fallback must fail, not silently satisfy the style assertion.
    try std.testing.expectEqual(counters_before.delta + 1, counters_after.delta);
    try std.testing.expectEqual(counters_before.capture, counters_after.capture);
    try std.testing.expect(identity.has_backing);
    try std.testing.expectEqual(live_before.materialize_units, live_after.materialize_units);
    try std.testing.expectEqual(live_before.inserted_copy_units + 1, live_after.inserted_copy_units);

    var current = try session.copySourceTextWindowUtf16(a, 0, reference.source.host, eof - 1, eof + 2);
    defer current.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 'C', 0, 'D', 0, 13, 0 }, current.bytes);
    try std.testing.expectEqual(@as(u32, eof + 2), current.total_units);
    try std.testing.expectEqual(@as(?u32, reference.source.host.original_node), current.source_node);
    try std.testing.expectEqual(old_window.parent_node, current.parent_node);
    try std.testing.expectEqualSlices(u8, &.{ 'C', 0, 13, 0 }, old_window.bytes);
    try std.testing.expectError(error.InvalidTextPosition, session.copySourceTextWindowUtf16(a, 0, reference.source.host, eof + 2, eof + 3));
    try std.testing.expectEqual(identity, edit.Testing.liveIdentity(session));
    try std.testing.expectEqual(live_after.materialize_units, session.liveTextCounters().materialize_units);
    try std.testing.expectEqual(live_after.source_copy_units, session.liveTextCounters().source_copy_units);

    // Undo/redo before save must exchange live metadata/backing, not a saved-byte
    // snapshot. Already returned windows own their bytes across both mutations.
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.redo(session));
    try std.testing.expectEqual(identity, edit.Testing.liveIdentity(session));
    try std.testing.expectEqual(live_after.materialize_units, session.liveTextCounters().materialize_units);
    try std.testing.expectEqualSlices(u8, &.{ 'C', 0, 'D', 0, 13, 0 }, current.bytes);

    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const ranges = try reopened.characterRanges(a, 0, paragraph);
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
    const saved_bindings = try reopened.tableBindings(a, 0);
    defer a.free(saved_bindings);
    try std.testing.expectEqualDeep(abc_bindings, saved_bindings);
    try std.testing.expectEqual(original_bindings.len, saved_bindings.len);
    for (original_bindings, saved_bindings) |before_binding, after_binding| {
        inline for (.{ "paragraph", "rows", "columns", "row", "column", "row_span", "column_span", "width", "height" }) |field|
            try std.testing.expectEqual(@field(before_binding, field), @field(after_binding, field));
    }
    const reopened_reference = try reopened.currentSourceParagraphReference(0, paragraph);
    try std.testing.expectEqualDeep(abc_reference, reopened_reference);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, abc.bytes, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    std.debug.print("EOF_MANAGED_RECEIPT host={s} paragraph={d} source={d} dShape={d} deltaAdded={d} captureAdded={d} backing=true preSaveMaterializeAdded={d} savedBindingCount={d}\n", .{ @tagName(host), paragraph, reference.source.host.original_node, d_id.?, counters_after.delta - counters_before.delta, counters_after.capture - counters_before.capture, live_after.materialize_units - live_before.materialize_units, saved_bindings.len });
}

test "caret EOF managed original cell uses live gap and saves current-reference style after redo" {
    try managed(@embedFile("caret_eof_fixtures/table.hwp"), .table_cell);
}
test "caret EOF managed original GSO textbox uses live gap and saves source style after redo" {
    try managed(@embedFile("caret_eof_fixtures/textbox.hwp"), .drawing);
}
