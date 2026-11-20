//! Combined-source declaration only; no Native execution is implied.
const std = @import("std");
const a = std.testing.allocator;

test "generated cell rich HX serializer receipt and physical promotion preserve rich D and exact history" {
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
    session.history_delta_managed = true;
    var history = try @import("hwpx/editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    const insertion: @import("model/formatting_patch.zig").Patch = .{ .character = .{ .underline_kind = .bottom, .strike_enabled = true, .text_color = 0 } };
    {
        var batch: @import("hwpx/formatting_batch_context.zig").Context = .{};
        try session.beginFormattingBatch(&batch);
        defer session.endFormattingBatch(&batch);
        try std.testing.expect(try history.apply(&session, .{ .kind = .splice_created_cell, .section = 0, .paragraph = 0, .start = 2, .deleted = 0, .inserted = "한😀D", .created_table_identity = table.identity, .created_cell = .{ 0, 0 }, .created_cell_insertion = &insertion }));
    }
    const cell = &session.sections[0].created_tables.entries.items[0].table.cells[0];
    var scratch: [1]@import("model/document.zig").CharacterRun = undefined;
    const rich_id = cell.runs(table.resources.character, &scratch)[1].char_shape_id;
    try std.testing.expect(rich_id != table.resources.character);
    const ordinary = try session.save();
    defer a.free(ordinary);
    var receipts: @import("hwpx/created_table_placement_receipts.zig").Receipts = .{};
    defer receipts.deinit(a);
    const with_receipts = try session.saveWithTablePlacements(&receipts);
    defer a.free(with_receipts);
    try std.testing.expectEqualSlices(u8, ordinary, with_receipts);
    var physical = try editor.open(a, with_receipts, .{});
    defer physical.deinit();
    var proof = try @import("hwpx/inline_object_table_transfer.zig").verify(&session, &physical, &receipts);
    defer proof.deinit();
    try std.testing.expectEqual(@as(usize, 1), proof.owners.count());
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].created_tables.entries.items.len);

    var identity_buffer: [20]u8 = undefined;
    const identity = try std.fmt.bufPrint(&identity_buffer, "{d}", .{table.identity});
    var serial_buffer: [20]u8 = undefined;
    const serial = try std.fmt.bufPrint(&serial_buffer, "{d}", .{session.mutation_serial});
    var observed = try @import("hwpx/inline_object_placement.zig").current(&session, .{ .section = 0, .created_cell = .{ .identity = identity, .row = 0, .column = 0 } }, .{ .session = "probe", .revision = history.revision(), .serial = serial });
    defer observed.deinit(a);
    try std.testing.expectEqualStrings("AB한😀D", observed.text);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(ordinary, &digest, .{});
    const request: @import("hwpx/equation_insert.zig").Request = .{ .expected_source_sha256 = digest, .target = .{ .section = 0, .paragraph = 0, .owner = observed.owner, .unit = 5, .expected_text = observed.text }, .script = "x+y", .width = 3000, .height = 1000, .base_line = 80, .base_unit = 1000, .version = "Equation Version 60", .font = "HYhwpEQ" };
    try std.testing.expect(try history.apply(&session, .{ .kind = .equation_insert, .section = 0, .paragraph = 0, .start = 5, .deleted = 0, .inserted = "", .equation_insert = &request }));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    const promoted = try session.save();
    defer a.free(promoted);
    var reopened = try editor.open(a, promoted, .{});
    defer reopened.deinit();
    const bindings = try @import("hwpx/table_display_bindings.zig").read(a, &reopened, 0);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 1), bindings.len);
    const paragraph = bindings[0].paragraph;
    const text = try reopened.anchorText(0, paragraph);
    defer a.free(text);
    const byte = std.mem.lastIndexOfScalar(u8, text, 'D') orelse return error.MissingRichD;
    const d_unit: u32 = @intCast(try std.unicode.calcUtf16LeLen(text[0..byte]));
    const spans = try @import("hwpx/character_style_snapshot.zig").read(&reopened, 0, paragraph);
    defer a.free(spans);
    var found = false;
    for (spans) |span| if (span.start_unit <= d_unit and span.end_unit > d_unit) {
        try std.testing.expectEqual(@as(?u32, rich_id), span.char_shape_id);
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].created_tables.entries.items.len);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, ordinary, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, promoted, redone);
}

comptime {
    _ = @import("generated_cell_rich_native_probe.zig");
}
