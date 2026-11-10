//! Actual Session + owned History tests; no external fixture or renderer.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const Group = @import("independent_text_session.zig").Group;
const a = std.testing.allocator;
const Harness = struct {
    allocator: std.mem.Allocator,
    session: *edit.Session,
    history: History,
    fn init() !Harness {
        return initWith(a);
    }
    fn initWith(allocator: std.mem.Allocator) !Harness {
        const bytes = try @import("../../new_document/root.zig").hwp5(allocator);
        defer allocator.free(bytes);
        const session = try edit.Session.open(allocator, bytes);
        errdefer session.close();
        try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "ab😀ab" } });
        try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 6 } });
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "tail ab" } });
        return .{ .allocator = allocator, .session = session, .history = try History.initV2(allocator, session, .{ .max_entries = 16 }) };
    }
    fn deinit(self: *Harness) void {
        self.history.deinit();
        self.session.close();
    }
    fn save(self: *Harness) ![]u8 {
        return (try self.session.save(self.allocator, .{ .allow_stale_layout = true })).bytes;
    }
};
const groups = [_]Group{
    .{ .section = 0, .paragraph = 1, .edits = &.{
        .{ .start = 0, .end = 2, .text = "XY", .expected = "ab" },
        .{ .start = 4, .end = 6, .text = "Z", .expected = "ab" },
    } },
    .{ .section = 0, .paragraph = 2, .edits = &.{.{ .start = 5, .end = 7, .text = "한", .expected = "ab" }} },
};
fn expectText(session: *edit.Session, paragraph: usize, expected: []const u8) !void {
    const actual = try session.copyText(a, 0, paragraph);
    defer a.free(actual);
    const terminated = try std.mem.concat(a, u8, &.{ expected, "\r" });
    defer a.free(terminated);
    const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, terminated);
    defer a.free(utf16);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(utf16), actual);
}

test "H5 independent session multi-paragraph cuts use one owned history entry and save reopen" {
    var h = try Harness.init();
    defer h.deinit();
    const before = try h.save();
    defer a.free(before);
    try std.testing.expect(try h.history.apply(h.session, .{ .splice_independent_text = &groups }));
    try expectText(h.session, 1, "XY😀Z");
    try expectText(h.session, 2, "tail 한");
    try std.testing.expectEqual(@as(usize, 1), h.history.stats().undoCount);
    const saved = try h.save();
    defer a.free(saved);
    if (std.process.Environ.getPosix(std.testing.environ, "HWPJS_INDEPENDENT_H5_OUTPUT")) |dir| {
        for ([_]struct { name: []const u8, bytes: []const u8 }{ .{ .name = "before.hwp", .bytes = before }, .{ .name = "after.hwp", .bytes = saved } }) |file| {
            const path = try std.fmt.allocPrint(a, "{s}/{s}", .{ dir, file.name });
            defer a.free(path);
            try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = path, .data = file.bytes });
        }
    }
    const reopened = try edit.Session.open(a, saved);
    defer reopened.close();
    try expectText(reopened, 1, "XY😀Z");
    try expectText(reopened, 2, "tail 한");
    try std.testing.expect(try h.history.undo(h.session));
    const undone = try h.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try h.history.redo(h.session));
    const redone = try h.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "H5 independent session noops and late expected failure preserve live values and redo" {
    var h = try Harness.init();
    defer h.deinit();
    try std.testing.expect(try h.history.apply(h.session, .{ .splice_independent_text = &groups }));
    try std.testing.expect(try h.history.undo(h.session));
    const stats = h.history.stats();
    const before = try h.save();
    defer a.free(before);
    const noop = [_]Group{.{ .section = 0, .paragraph = 1, .edits = &.{.{ .start = 0, .end = 2, .text = "ab", .expected = "ab" }} }};
    try std.testing.expect(!try h.history.apply(h.session, .{ .splice_independent_text = &noop }));
    try std.testing.expectEqual(stats.revision, h.history.revision());
    var bad = groups;
    bad[1].edits = &.{.{ .start = 5, .end = 7, .text = "FAIL", .expected = "zz" }};
    // Direct Session must also publish no partial target, before History rollback.
    try std.testing.expectError(error.ExpectedTextMismatch, h.session.apply(.{ .splice_independent_text = &bad }));
    const failed = try h.save();
    defer a.free(failed);
    try std.testing.expectEqualSlices(u8, before, failed);
    try std.testing.expectEqual(stats.redoCount, h.history.stats().redoCount);
    try std.testing.expectError(error.ExpectedTextMismatch, h.history.apply(h.session, .{ .splice_independent_text = &bad }));
    try std.testing.expectEqual(stats.redoCount, h.history.stats().redoCount);
    try std.testing.expect(try h.history.redo(h.session));
    try expectText(h.session, 1, "XY😀Z");
}

test "H5 independent session duplicate targets scalar boundaries and controls reject before writes" {
    var h = try Harness.init();
    defer h.deinit();
    const before = try h.save();
    defer a.free(before);
    const duplicate = [_]Group{ groups[0], groups[0] };
    try std.testing.expectError(error.DuplicateTextTransactionTarget, h.history.apply(h.session, .{ .splice_independent_text = &duplicate }));
    const split = [_]Group{.{ .section = 0, .paragraph = 1, .edits = &.{.{ .start = 3, .end = 3, .text = "x", .expected = "" }} }};
    try std.testing.expectError(error.SplitSurrogatePair, h.history.apply(h.session, .{ .splice_independent_text = &split }));
    const control = [_]Group{.{ .section = 0, .paragraph = 1, .edits = &.{.{ .start = 0, .end = 0, .text = "\n", .expected = "" }} }};
    try std.testing.expectError(error.UnsupportedTextControl, h.history.apply(h.session, .{ .splice_independent_text = &control }));
    const after = try h.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(@as(usize, 0), h.history.stats().undoCount);
}

test "H5 independent session sampled transaction OOM retains exact saved state and history" {
    var measured: usize = 0;
    var failures: usize = 0;
    const samples = 32;
    for (0..samples + 1) |sample| {
        if (sample > 0 and sample > measured) break;
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var h = try Harness.initWith(fa);
        defer h.deinit();
        const before = try h.save();
        defer fa.free(before);
        const stats = h.history.stats();
        const start = failing.alloc_index;
        if (sample != 0) failing.fail_index = start + (sample - 1) * measured / @min(samples, measured);
        var failed = false;
        _ = h.history.apply(h.session, .{ .splice_independent_text = &groups }) catch |err| block: {
            try std.testing.expectEqual(error.OutOfMemory, err);
            failed = true;
            break :block false;
        };
        if (sample == 0) measured = failing.alloc_index - start;
        failing.fail_index = std.math.maxInt(usize);
        if (failed) {
            failures += 1;
            try std.testing.expectEqualDeep(stats, h.history.stats());
            const after = try h.save();
            defer fa.free(after);
            try std.testing.expectEqualSlices(u8, before, after);
        }
    }
    try std.testing.expect(measured > 0);
    try std.testing.expect(failures > 0);
    std.debug.print("H5 independent Session transaction OOM {d} sampled failures / {d} successful allocations\n", .{ failures, measured });
}

test "H5 independent session text and current formatting share one history application" {
    var h = try Harness.init();
    defer h.deinit();
    const before = try h.save();
    defer a.free(before);
    const commands = [_]edit.Command{
        .{ .splice_independent_text = &groups },
        .{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 2, .properties = .{ .bold = true, .size = 1900, .text_color = 0x123456 } } },
    };
    try std.testing.expect(try h.history.applyBatch(h.session, &commands));
    try std.testing.expectEqual(@as(usize, 1), h.history.stats().undoCount);
    try expectText(h.session, 1, "XY😀Z");
    const spans = try h.session.characterRanges(a, 0, 1);
    defer a.free(spans);
    const shapes = try h.session.characterShapes(a);
    defer a.free(shapes);
    try std.testing.expectEqual(@as(u32, 0), spans[0].start_unit);
    try std.testing.expectEqual(@as(u32, 2), spans[0].end_unit);
    const painted = shapes[spans[0].char_shape_id.?];
    try std.testing.expect(painted.bold);
    try std.testing.expectEqual(@as(i32, 1900), painted.height);
    try std.testing.expectEqual(@as(u32, 0x123456), @import("../../model/rgb_color.zig").hwp5(painted.text_color_raw));
    try std.testing.expectEqual(@as(u32, 0), spans[1].char_shape_id.?);
    const formatted = try h.save();
    defer a.free(formatted);
    try std.testing.expect(try h.history.undo(h.session));
    const undone = try h.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try h.history.redo(h.session));
    const redone = try h.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, formatted, redone);
}

const table_options: @import("created_table_records.zig").Options = .{
    .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "Independent text scope" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};
fn tableInput() ![]u8 {
    var h = try Harness.init();
    defer h.deinit();
    var ids = try h.session.planTableIds(1);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "CELL😀AB", 100);
    try h.session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 2, .unit = 0, .table = &table, .options = table_options } });
    return h.save();
}

test "H5 independent session original and generated nested cells retain ordinary edit scope" {
    const input = try tableInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const flow = try session.paragraphFlow(a, 0);
    defer a.free(flow);
    var cell: ?usize = null;
    for (flow) |row| if (row.host == .table_cell) {
        cell = row.paragraph;
        break;
    };
    const index = cell orelse return error.MissingTestCell;
    try std.testing.expect((try session.paragraph(0, index)).source_node != null);
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    const original_group = [_]Group{.{ .section = 0, .paragraph = index, .edits = &.{
        .{ .start = 0, .end = 4, .text = "CELL2", .expected = "CELL" },
        .{ .start = 6, .end = 8, .text = "CD", .expected = "AB" },
    } }};
    try std.testing.expect(try history.apply(session, .{ .splice_independent_text = &original_group }));
    try expectText(session, index, "CELL2😀CD");
    try std.testing.expect(try history.undo(session));
    try expectText(session, index, "CELL😀AB");
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = index, .at_unit = 0 } }));
    try std.testing.expect((try session.paragraph(0, index + 1)).source_node == null);
    const generated_group = [_]Group{.{ .section = 0, .paragraph = index + 1, .edits = original_group[0].edits }};
    try std.testing.expect(try history.apply(session, .{ .splice_independent_text = &generated_group }));
    try expectText(session, index + 1, "CELL2😀CD");
    try std.testing.expect(try history.undo(session));
    try expectText(session, index + 1, "CELL😀AB");
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try expectText(reopened, index + 1, "CELL😀AB");
}

fn twoSectionInput() ![]u8 {
    var h = try Harness.init();
    defer h.deinit();
    const input = try h.save();
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const count = try @import("../docinfo/section_count.zig").locate(info, source.header.version());
    std.mem.writeInt(u16, info[count.payload_offset..][0..2], 2, .little);
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    const encoded_info = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, info, 4_000_000) else try a.dupe(u8, info);
    defer a.free(encoded_info);
    const encoded_body = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, body, 4_000_000) else try a.dupe(u8, body);
    defer a.free(encoded_body);
    return @import("../test_section_count_fixture.zig").build(a, &source.header.raw, encoded_info, encoded_body, &.{ "Section0", "Section1" });
}

test "H5 independent session nonadjacent targets across sections preserve other text and one undo" {
    const input = try twoSectionInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    try std.testing.expectEqual(@as(usize, 2), session.sectionCount());
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    var request = groups;
    request[1].section = 1;
    try std.testing.expect(try history.apply(session, .{ .splice_independent_text = &request }));
    try expectText(session, 1, "XY😀Z");
    try expectText(session, 2, "tail ab");
    const modified = try session.copyText(a, 1, 2);
    defer a.free(modified);
    const expected = try std.unicode.utf8ToUtf16LeAlloc(a, "tail 한\r");
    defer a.free(expected);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected), modified);
    try std.testing.expectEqual(@as(usize, 1), history.stats().undoCount);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
}

test "H5 independent session later formatting rejection rolls back swapped paragraphs and keeps redo" {
    var h = try Harness.init();
    defer h.deinit();
    try std.testing.expect(try h.history.apply(h.session, .{ .splice_independent_text = &groups }));
    try std.testing.expect(try h.history.undo(h.session));
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    const commands = [_]edit.Command{
        .{ .splice_independent_text = &groups },
        .{ .set_character_format = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 1, .char_shape_id = std.math.maxInt(u32) } },
    };
    try std.testing.expectError(error.InvalidResourceReference, h.history.applyBatch(h.session, &commands));
    const failed = try h.save();
    defer a.free(failed);
    try std.testing.expectEqualSlices(u8, before, failed);
    try std.testing.expectEqual(stats.revision, h.history.revision());
    try std.testing.expectEqual(stats.undoCount, h.history.stats().undoCount);
    try std.testing.expectEqual(stats.redoCount, h.history.stats().redoCount);
    try std.testing.expect(!h.history.stats().poisoned);
    try std.testing.expect(try h.history.redo(h.session));
    try expectText(h.session, 1, "XY😀Z");
}

fn omittedTextInput() ![]u8 {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var body: std.ArrayList(u8) = .empty;
    defer body.deinit(a);
    try body.appendSlice(a, raw);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 1, .little);
    std.mem.writeInt(u32, header[18..22], 1, .little);
    try @import("../record_writer.zig").append(a, &body, 66, 0, &header, 4_000_000);
    const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, body.items, 4_000_000) else try a.dupe(u8, body.items);
    defer a.free(encoded);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{});
}

test "H5 independent session omitted empty paragraph noop keeps absence flags and redo" {
    const input = try omittedTextInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const presence = try session.displayTextPresence(0, 1);
    try std.testing.expect(presence.observed_empty);
    try std.testing.expectEqual(@as(usize, 0), presence.token_count);
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "x" } }));
    try std.testing.expect(try history.undo(session));
    const stats = history.stats();
    const noop = [_]Group{.{ .section = 0, .paragraph = 1, .edits = &.{.{ .start = 0, .end = 0, .text = "", .expected = "" }} }};
    try std.testing.expect(!try history.apply(session, .{ .splice_independent_text = &noop }));
    try std.testing.expectEqualDeep(presence, try session.displayTextPresence(0, 1));
    try std.testing.expectEqual(stats.revision, history.revision());
    try std.testing.expectEqual(stats.redoCount, history.stats().redoCount);
    const after = try session.save(a, .{});
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, input, after.bytes);
    try std.testing.expect(try history.redo(session));
}

test "H5 independent session Native coverage includes pending cell store and does not grant write permission" {
    var h = try Harness.init();
    defer h.deinit();
    const before = try h.session.independentTextCoverage(a);
    defer a.free(before.sections);
    try std.testing.expectEqual(@as(u32, 3), before.paragraphs);
    try std.testing.expectEqual(@as(u32, 0), before.created_cell_paragraphs);
    var ids = try h.session.planTableIds(1);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    try h.session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 2, .unit = 0, .table = &table, .options = table_options } });
    const saved = try h.save();
    defer a.free(saved);
    const after = try h.session.independentTextCoverage(a);
    defer a.free(after.sections);
    try std.testing.expectEqual(@as(u32, 4), after.paragraphs);
    try std.testing.expectEqual(@as(u32, 4), after.sections[0].paragraphs);
    try std.testing.expectEqual(@as(u32, 1), after.created_cell_paragraphs);
    const references = try h.session.currentParagraphReferences(a, 0, 20000);
    defer a.free(references);
    try std.testing.expectEqual(@as(usize, after.paragraphs), references.len);
    try std.testing.expectError(error.UnsupportedIndependentCreatedTableHost, h.session.apply(.{ .splice_independent_text = &groups }));
    const failed = try h.save();
    defer a.free(failed);
    try std.testing.expectEqualSlices(u8, saved, failed);
}
