//! Synthetic-only regression for suffix edits after earlier-section grid changes.
const std = @import("std");
const editor = @import("hwpx/editor_session.zig");
const histories = @import("hwpx/editor_history.zig");
const fixture = @import("hwpx/test_package_fixture.zig");
const package = @import("hwpx/package.zig");
const fields = @import("hwpx/table_xml_fields.zig");
const a = std.testing.allocator;
const opening = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";

fn laterSection(edited: ?usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try out.appendSlice(a, opening);
    for ("ABCDE", 0..) |letter, i| {
        const p = try std.fmt.allocPrint(a, "<p:p id='{d}'><p:run><p:t>{c}{s}</p:t></p:run></p:p>", .{ 100 + i, letter, if (edited == i) "!" else "" });
        defer a.free(p);
        try out.appendSlice(a, p);
    }
    try out.appendSlice(a, "</s:sec>");
    return out.toOwnedSlice(a);
}

fn inputZip() ![]u8 {
    var first: std.ArrayList(u8) = .empty;
    defer first.deinit(a);
    try first.appendSlice(a, opening ++ "<p:p id='10'><p:run><p:t>host</p:t><p:tbl rowCnt='2' colCnt='2'><p:sz width='40' height='20' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>");
    for (0..2) |r| {
        try first.appendSlice(a, "<p:tr>");
        for (0..2) |c| {
            const cell = try std.fmt.allocPrint(a, "<p:tc><p:subList id=''><p:p id='{d}'><p:run><p:t>cell</p:t></p:run></p:p></p:subList><p:cellAddr rowAddr='{d}' colAddr='{d}'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='20' height='10'/></p:tc>", .{ 20 + r * 2 + c, r, c });
            defer a.free(cell);
            try first.appendSlice(a, cell);
        }
        try first.appendSlice(a, "</p:tr>");
    }
    try first.appendSlice(a, "</p:tbl></p:run></p:p></s:sec>");
    const later = try laterSection(null);
    defer a.free(later);
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = fixture.structure_hpf },
        .{ .name = "Contents/header.xml", .data = fixture.structure_header },
        .{ .name = "Contents/chapter-B.xml", .data = first.items },
        .{ .name = "Contents/chapter-A.xml", .data = later },
        .{ .name = "Contents/extra.xml", .data = "<misc/>" },
    });
}

fn expectTexts(s: *const editor.Session, edited: ?usize) !void {
    for ("ABCDE", 0..) |letter, i| {
        const text = try s.anchorText(1, s.sections[1].first_paragraph + i);
        defer a.free(text);
        const expected = [_]u8{ letter, '!' };
        try std.testing.expectEqualStrings(expected[0..if (edited == i) @as(usize, 2) else 1], text);
    }
}

fn expectSaved(bytes: []const u8, edited: ?usize) !void {
    var d = try package.inspectDocument(a, bytes, .{});
    defer d.deinit(a);
    const expected = try laterSection(edited);
    defer a.free(expected);
    var found = false;
    for (d.archive.entries) |entry| if (std.mem.eql(u8, entry.name, "Contents/chapter-A.xml")) {
        const xml = try d.archive.decode(entry, 1_000_000);
        defer a.free(xml);
        try std.testing.expectEqualStrings(expected, xml);
        found = true;
    };
    try std.testing.expect(found);
    var reopened = try editor.open(a, bytes, .{});
    defer reopened.deinit();
    try expectTexts(&reopened, edited);
}

fn run(v2: bool, managed: bool, insert: bool) !void {
    const input = try inputZip();
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = managed;
    var h = if (v2) try histories.History.initV2(&s, .{}) else try histories.History.init(&s, 16, 8_000_000);
    defer h.deinit();
    const source_ptr = s.source.ptr;
    const source_first = s.sections[1].source_first_paragraph;
    const before = try s.save();
    defer a.free(before);
    var node: ?usize = null;
    for (s.sections[0].tree.elements, 0..) |_, i| if (fields.childIs(&s.sections[0].tree, i, "tbl")) {
        node = i;
    };
    try std.testing.expect(try h.apply(&s, .{ .kind = .source_table_grid, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .source_grid_node = node.?, .source_grid_expected_rows = 2, .source_grid_expected_columns = 2, .source_grid_action = if (insert) .{ .insert_row = 1 } else .{ .delete_row = 1 } }));
    try std.testing.expectEqual(source_first, s.sections[1].source_first_paragraph);
    try std.testing.expectEqual(if (insert) source_first.? + 2 else source_first.? - 2, s.sections[1].first_paragraph);
    const grid = try s.save();
    defer a.free(grid);
    try expectSaved(grid, null);
    const target: usize = if (insert) 0 else 2;
    const deltas = if (v2) h.owned.?.counters.delta else 0;
    try std.testing.expect(try h.apply(&s, .{ .section = 1, .paragraph = s.sections[1].first_paragraph + target, .start = 1, .deleted = 0, .inserted = "!" }));
    try expectTexts(&s, target);
    if (v2 and managed) try std.testing.expectEqual(deltas + 1, h.owned.?.counters.delta);
    const after = try s.save();
    defer a.free(after);
    try expectSaved(after, target);
    try std.testing.expect(try h.undo(&s));
    try expectTexts(&s, null);
    const undo_text = try s.save();
    defer a.free(undo_text);
    try std.testing.expectEqualSlices(u8, grid, undo_text);
    try std.testing.expect(try h.undo(&s));
    const undo_grid = try s.save();
    defer a.free(undo_grid);
    try std.testing.expectEqualSlices(u8, before, undo_grid);
    try expectSaved(undo_grid, null);
    try std.testing.expect(try h.redo(&s));
    const redo_grid = try s.save();
    defer a.free(redo_grid);
    try std.testing.expectEqualSlices(u8, grid, redo_grid);
    try std.testing.expect(try h.redo(&s));
    try expectTexts(&s, target);
    const redo_text = try s.save();
    defer a.free(redo_text);
    try std.testing.expectEqualSlices(u8, after, redo_text);
    try expectSaved(redo_text, target);
    try std.testing.expect(s.source.ptr == source_ptr);
    try std.testing.expectEqualSlices(u8, input, s.source);
}

test "suffix source coordinates v2 managed insert" {
    try run(true, true, true);
}
test "suffix source coordinates v2 managed delete" {
    try run(true, true, false);
}
test "suffix source coordinates v2 unmanaged insert delete" {
    try run(true, false, true);
    try run(true, false, false);
}
test "suffix source coordinates v1 managed insert delete" {
    try run(false, true, true);
    try run(false, true, false);
}
test "suffix source coordinates v1 unmanaged insert delete" {
    try run(false, false, true);
    try run(false, false, false);
}
