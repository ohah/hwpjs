const std = @import("std");
const editor = @import("editor_session.zig");
const adapter = @import("source_table_grid_session.zig");
const histories = @import("editor_history.zig");
const fixture = @import("test_package_fixture.zig");
const package = @import("package.zig");
const fields = @import("table_xml_fields.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10'><p:run><p:t>before</p:t>";
fn section(allocator: std.mem.Allocator) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(allocator);
    try bytes.appendSlice(allocator, prefix ++ "<p:tbl rowCnt='2' colCnt='2'><p:sz width='40' height='20' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>");
    for (0..2) |r| {
        try bytes.appendSlice(allocator, "<p:tr>");
        for (0..2) |c| {
            const cell = try std.fmt.allocPrint(allocator, "<p:tc><p:subList id=''><p:p id='{d}'><p:run><p:t>cell{d}&amp;😀</p:t></p:run></p:p></p:subList><p:cellAddr rowAddr='{d}' colAddr='{d}'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='20' height='10'/></p:tc>", .{ 20 + r * 2 + c, r * 2 + c, r, c });
            defer allocator.free(cell);
            try bytes.appendSlice(allocator, cell);
        }
        try bytes.appendSlice(allocator, "</p:tr>\n");
    }
    try bytes.appendSlice(allocator, "</p:tbl><p:t>after</p:t></p:run></p:p></s:sec>");
    return bytes.toOwnedSlice(allocator);
}
fn synthetic() ![]u8 {
    const source = try section(a);
    defer a.free(source);
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' secCnt='2'><h:resource id='5'/><p:p id='1'/></h:head>";
    const other = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='3'/></s:sec>";
    const hpf = try std.mem.replaceOwned(u8, a, fixture.structure_hpf, "</p:manifest>", "<p:item id='master' href='Contents/masterpage0.xml' media-type='application/xml'/></p:manifest>");
    defer a.free(hpf);
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/chapter-B.xml", .data = source },
        .{ .name = "Contents/chapter-A.xml", .data = other },
        .{ .name = "Contents/extra.xml", .data = "<misc/>" },
        .{ .name = "Contents/masterpage0.xml", .data = "<m:masterPage xmlns:m='http://www.hancom.co.kr/hwpml/2011/master-page' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='2'/></m:masterPage>" },
        .{ .name = "unlisted.xml", .data = "<extra xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='4'/></extra>" },
        .{ .name = "BinData/opaque.bin", .data = "opaque\x00\xff" },
    });
}

fn node(s: *const editor.Session) !usize {
    for (s.sections[0].tree.elements, 0..) |_, i| if (fields.childIs(&s.sections[0].tree, i, "tbl")) return i;
    return error.MissingTestTable;
}
fn command(s: *const editor.Session, rows: u32, cols: u32, action: adapter.Command) !histories.Command {
    return .{ .kind = .source_table_grid, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .source_grid_node = try node(s), .source_grid_expected_rows = rows, .source_grid_expected_columns = cols, .source_grid_action = action };
}
fn direct(allocator: std.mem.Allocator, input: []const u8) !void {
    var s = try editor.open(allocator, input, .{});
    defer s.deinit();
    const source = s.source.ptr;
    const original = s.sections[0].original_basis;
    const later = s.sections[1].first_paragraph;
    const before = try s.save();
    defer allocator.free(before);
    _ = try adapter.apply(&s, .{ .section = 0, .node = try node(&s), .expected_rows = 2, .expected_columns = 2, .action = .{ .insert_row = 1 } });
    try std.testing.expect(s.source.ptr == source);
    try std.testing.expect(s.sections[0].original_basis == original);
    try std.testing.expect(s.sections[0].tree.source.ptr != original.?.tree.source.ptr);
    try std.testing.expectEqual(later + 2, s.sections[1].first_paragraph);
    const after = try s.save();
    defer allocator.free(after);
    var reopened = try editor.open(allocator, after, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(u32, 3), (try fields.optionalUnsigned(allocator, &reopened.sections[0].tree, try node(&reopened), "rowCnt", 4096)).?);
}
fn history(input: []const u8, v2: bool, managed: bool, formatted: bool) !void {
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = managed;
    var h = if (v2) try histories.History.initV2(&s, .{}) else try histories.History.init(&s, 32, 8 * 1024 * 1024);
    defer h.deinit();
    const pointer = s.source.ptr;
    const before = try s.save();
    defer a.free(before);
    // Pending text in another section must survive selected-section rebasing.
    var count: usize = 0;
    if (s.sections.len > 1 and s.sections[1].sites.items.len != 0) {
        try std.testing.expect(try h.apply(&s, .{ .section = 1, .paragraph = s.sections[1].first_paragraph, .start = 0, .deleted = 0, .inserted = "other" }));
        count += 1;
    }
    if (formatted) {
        const bindings = try @import("table_display_bindings.zig").read(a, &s, 0);
        defer a.free(bindings);
        const paragraph = bindings[0].paragraph;
        try std.testing.expect(try h.apply(&s, .{ .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "mixed😀text" }));
        try std.testing.expect(try h.apply(&s, .{ .kind = .character_properties, .paragraph = paragraph, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .bold = true } }));
        count += 2;
    }
    const cases = [_]struct { rows: u32, cols: u32, action: adapter.Command }{
        .{ .rows = 2, .cols = 2, .action = .{ .insert_row = 1 } },
        .{ .rows = 3, .cols = 2, .action = .{ .insert_column = 1 } },
        .{ .rows = 3, .cols = 3, .action = .{ .delete_row = 1 } },
        .{ .rows = 2, .cols = 3, .action = .{ .delete_column = 1 } },
    };
    for (cases) |case| {
        try std.testing.expect(try h.apply(&s, try command(&s, case.rows, case.cols, case.action)));
        count += 1;
    }
    if (formatted) {
        // Query fresh bindings after every source install; old element IDs expire.
        const bindings = try @import("table_display_bindings.zig").read(a, &s, 0);
        defer a.free(bindings);
        const paragraph = bindings[0].paragraph;
        try std.testing.expect(try h.apply(&s, .{ .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "after" }));
        try std.testing.expect(try h.apply(&s, .{ .kind = .character_properties, .paragraph = paragraph, .start = 1, .deleted = 2, .inserted = "", .character_properties = .{ .italic = true } }));
        count += 2;
    }
    const after = try s.save();
    defer a.free(after);
    for (0..count) |_| try std.testing.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    for (0..count) |_| try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
    try std.testing.expect(s.source.ptr == pointer);
}
test "source grid session synthetic multi section all commands v1 v2 managed unmanaged exact ZIP" {
    const input = try synthetic();
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| for ([_]bool{ false, true }) |managed| try history(input, v2, managed, false);
}
test "source grid session direct ownership later paragraph IDs and OOM" {
    const input = try synthetic();
    defer a.free(input);
    try direct(a, input);
    try @import("../testing/allocation_failures.zig").check(direct, .{input});
}
const approved = "/Users/yoonhb/Documents/workspace/hwpjs/zig-out/verification/created-table-ui-r1/browser-public-r1/vanilla-hwpx.hwpx";
fn validatePath(path: []const u8) !void {
    // Exact lexical allowlist, before any file operation; no fallback search.
    if (!std.fs.path.isAbsolute(path) or !std.mem.eql(u8, path, approved)) return error.UnapprovedSourceGridFixture;
}
test "source grid session approved real fixture strict env history" {
    const path = try std.process.Environ.getAlloc(std.testing.environ, a, "HWPJS_TEST_SOURCE_GRID_HWPX");
    defer a.free(path);
    try validatePath(path);
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| for ([_]bool{ false, true }) |managed| try history(input, v2, managed, true);
}
test "source grid session rejects invalid target shape and lexical fixture paths" {
    const input = try synthetic();
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const before = try s.save();
    defer a.free(before);
    try std.testing.expectError(error.InvalidSourceTableTarget, adapter.apply(&s, .{ .section = 0, .node = 0, .expected_rows = 2, .expected_columns = 2, .action = .{ .insert_row = 0 } }));
    try std.testing.expectError(error.InvalidTableGridEdit, adapter.apply(&s, .{ .section = 0, .node = try node(&s), .expected_rows = 2, .expected_columns = 2, .action = .{ .delete_row = 2 } }));
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    for ([_][]const u8{ "", "relative.hwpx", "/unowned/vanilla-hwpx.hwpx", "/Users/yoonhb/Documents/workspace/hwpjs/./zig-out/verification/created-table-ui-r1/browser-public-r1/vanilla-hwpx.hwpx" }) |path| try std.testing.expectError(error.UnapprovedSourceGridFixture, validatePath(path));
}

fn replacePart(input: []const u8, name: []const u8, bytes: []const u8) ![]u8 {
    var d = try package.inspectDocument(a, input, .{});
    defer d.deinit(a);
    for (d.archive.entries, 0..) |entry, i| if (std.mem.eql(u8, entry.name, name)) return @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = i, .bytes = bytes }}, .{});
    return error.MissingTestPart;
}
fn expectRefusal(input: []const u8, expected: anyerror) !void {
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const before = try s.save();
    defer a.free(before);
    const pointer = s.source.ptr;
    try std.testing.expectError(expected, adapter.apply(&s, .{ .section = 0, .node = try node(&s), .expected_rows = 2, .expected_columns = 2, .action = .{ .insert_row = 1 } }));
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(s.source.ptr == pointer);
}
test "source grid session empty plain cache signed security and stale shape" {
    const input = try synthetic();
    defer a.free(input);
    const source = try section(a);
    defer a.free(source);
    const empty = try std.mem.replaceOwned(u8, a, source, "cell0&amp;😀", "");
    defer a.free(empty);
    const blank = try replacePart(input, "Contents/chapter-B.xml", empty);
    defer a.free(blank);
    try history(blank, false, false, false);
    const cached_xml = try std.mem.replaceOwned(u8, a, source, "</p:p></p:subList>", "<p:linesegarray><p:lineseg/></p:linesegarray></p:p></p:subList>");
    defer a.free(cached_xml);
    const cached = try replacePart(input, "Contents/chapter-B.xml", cached_xml);
    defer a.free(cached);
    try expectRefusal(cached, error.UnsupportedSourceTableStructure);
    const signed = try replacePart(input, "unlisted.xml", "<d:Signature xmlns:d='http://www.w3.org/2000/09/xmldsig#'/>");
    defer a.free(signed);
    try expectRefusal(signed, error.SignedDocument);
    const protected_xml = try std.mem.replaceOwned(u8, a, source, "rowCnt='2'", "protect='1' rowCnt='2'");
    defer a.free(protected_xml);
    const protected = try replacePart(input, "Contents/chapter-B.xml", protected_xml);
    defer a.free(protected);
    try expectRefusal(protected, error.ProtectedSourceTable);
}
test "source grid session managed direct serial guard and pending fill refusal" {
    const input = try synthetic();
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    const req: adapter.Request = .{ .section = 0, .node = try node(&s), .expected_rows = 2, .expected_columns = 2, .action = .{ .insert_column = 1 } };
    try s.cell_backgrounds.append(a, .{ .section = 0, .table_node = req.node, .cell_node = 0, .list_node = 0, .source_id = 0 });
    try std.testing.expectError(error.UnsupportedSourceTablePendingIntent, adapter.apply(&s, req));
    try std.testing.expectEqual(@as(u64, 0), s.mutation_serial);
    s.cell_backgrounds.clearRetainingCapacity();
    s.mutation_serial = std.math.maxInt(u64);
    try std.testing.expectError(error.HistoryRevisionExhausted, adapter.apply(&s, req));
    s.mutation_serial = 0;
    try std.testing.expect(try adapter.apply(&s, req));
    try std.testing.expectEqual(@as(u64, 1), s.mutation_serial);
    try std.testing.expect(!s.history_transaction_active);
}
