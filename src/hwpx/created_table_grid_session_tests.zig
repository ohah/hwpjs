//! Independently authored expectations for generated, unit-span grids only.
const std = @import("std");
const editor = @import("editor_session.zig");
const grid = @import("../model/created_table_grid.zig");
const transaction = @import("created_table_grid_session.zig");
const history = @import("editor_history.zig");
const model = @import("../model/created_table.zig");
const a = std.testing.allocator;

fn stage(session: *editor.Session, paragraph: usize, resources: model.Resources, rows: u32, columns: u32) !u64 {
    var table = try @import("created_table_prepare.zig").prepare(session, 0, paragraph, 0, rows, columns, 101, 17, resources);
    defer table.deinit(session.allocator);
    const labels = [_][]const u8{ "가😀<&", "B", "C", "D" };
    for (table.cells, 0..) |_, index| {
        _ = try table.replaceText(session.allocator, @intCast(index / columns), @intCast(index % columns), labels[index % labels.len], 100);
    }
    _ = try @import("created_table_session.zig").stage(session, 0, paragraph, 0, &table);
    return table.identity;
}

fn generated(session: *editor.Session) *model.Table {
    return &session.sections[0].created_tables.entries.items[0].table;
}

fn expectSaved(session: *editor.Session, bytes: []const u8) !void {
    const saved = try session.save();
    defer session.allocator.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

fn reopen(session: *editor.Session, expected: []const []const u8) !void {
    const saved = try session.save();
    defer session.allocator.free(saved);
    var opened = try editor.open(a, saved, session.options);
    defer opened.deinit();
    const bindings = try @import("table_display_bindings.zig").read(a, &opened, 0);
    defer a.free(bindings);
    try std.testing.expectEqual(expected.len, bindings.len);
    for (bindings, expected) |binding, text| {
        const actual = try opened.anchorText(0, binding.paragraph);
        defer a.free(actual);
        try std.testing.expectEqualStrings(text, actual);
    }
    // Reopening materializes source XML; generated identity is session-local.
    try std.testing.expectEqual(@as(usize, 0), opened.sections[0].created_tables.entries.items.len);
}

test "HWPX created table grid four commands preserve IDs geometry ownership and reopen" {
    const source = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(source);
    const commands = [_]grid.Command{ .{ .insert_row = 1 }, .{ .delete_row = 0 }, .{ .insert_column = 1 }, .{ .delete_column = 0 } };
    const expected = [_][]const []const u8{
        &.{ "가😀<&", "B", "", "", "C", "D" },
        &.{ "C", "D" },
        &.{ "가😀<&", "", "B", "C", "", "D" },
        &.{ "B", "D" },
    };
    const old_offsets = [_][]const usize{ &.{ 0, 1, 99, 99, 2, 3 }, &.{ 2, 3 }, &.{ 0, 99, 1, 2, 99, 3 }, &.{ 1, 3 } };
    for (commands, expected, old_offsets, 0..) |edit, texts, offsets, test_index| {
        var session = try editor.open(a, source, .{});
        defer session.deinit();
        const identity = try stage(&session, 1, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2, 2);
        var before = try session.sections[0].created_tables.clone(a);
        defer before.deinit(a);
        const old = &before.entries.items[0].table;
        try std.testing.expect(try transaction.apply(&session, 0, identity, edit));
        const current = generated(&session);
        try std.testing.expectEqual(identity, current.identity);
        try std.testing.expectEqual(old.instance_id, current.instance_id);
        try std.testing.expectEqualDeep(old.resources, current.resources);
        try std.testing.expectEqualDeep(before.entries.items[0].anchor, session.sections[0].created_tables.entries.items[0].anchor);
        try std.testing.expectEqual(@as(u32, 101), current.plan.width);
        try std.testing.expectEqual(@as(u32, 17), current.plan.row_height);
        try std.testing.expectEqual(@as(u32, if (test_index == 0) 3 else if (test_index == 1) 1 else 2), current.plan.rows);
        try std.testing.expectEqual(@as(u32, if (test_index == 2) 3 else if (test_index == 3) 1 else 2), current.plan.columns);
        for (current.cells, texts, offsets) |cell, text, offset| {
            try std.testing.expectEqualStrings(text, cell.text);
            if (offset != 99) {
                try std.testing.expectEqual(old.cells[offset].paragraph_id, cell.paragraph_id);
                try std.testing.expect(cell.text.ptr != old.cells[offset].text.ptr);
            } else {
                for (old.cells) |prior| try std.testing.expect(prior.paragraph_id != cell.paragraph_id);
            }
        }
        try reopen(&session, texts);
        try std.testing.expectEqualSlices(u8, source, session.source);
    }
}

fn command(identity: u64, edit: grid.Command) history.Command {
    return .{ .kind = .created_table_grid, .section = 0, .created_table_identity = identity, .created_grid = edit, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}

test "HWPX created table grid history single revisions undo redo and invalid command" {
    const source = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(source);
    inline for (.{ false, true }) |v2| {
        var session = try editor.open(a, source, .{});
        defer session.deinit();
        const identity = try stage(&session, 1, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2, 2);
        var h = if (v2) try history.History.initV2(&session, .{}) else try history.History.init(&session, 8, 16 * 1024 * 1024);
        defer h.deinit();
        const before = try session.save();
        defer a.free(before);
        const commands = [_]grid.Command{ .{ .insert_row = 1 }, .{ .insert_column = 1 }, .{ .delete_row = 0 }, .{ .delete_column = 0 } };
        for (commands) |edit| try std.testing.expect(try h.apply(&session, command(identity, edit)));
        const final = try session.save();
        defer a.free(final);
        const revision = h.revision();
        try std.testing.expectEqual(@as(u32, 4), revision);
        try std.testing.expectError(error.InvalidTableGridEdit, h.apply(&session, command(identity, .{ .delete_row = 100 })));
        var bad = command(identity, .{ .insert_row = 0 });
        bad.inserted = "unrelated";
        try std.testing.expectError(error.InvalidCreatedTableCommand, h.apply(&session, bad));
        try std.testing.expectEqual(revision, h.revision());
        try expectSaved(&session, final);
        for (0..4) |_| try std.testing.expect(try h.undo(&session));
        try std.testing.expect(!try h.undo(&session));
        try expectSaved(&session, before);
        for (0..4) |_| try std.testing.expect(try h.redo(&session));
        try std.testing.expect(!try h.redo(&session));
        try expectSaved(&session, final);
        try reopen(&session, &.{ "", "", "", "D" });
    }
}

test "HWPX created table grid invalid identity index limits XML and full save are atomic" {
    const source = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(source);
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    const identity = try stage(&session, 1, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2, 2);
    var values = try session.sections[0].created_tables.clone(a);
    defer values.deinit(a);
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.InvalidSectionIndex, transaction.apply(&session, 1, identity, .{ .insert_row = 0 }));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, transaction.apply(&session, 0, 0, .{ .insert_row = 0 }));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, transaction.apply(&session, 0, identity + 1, .{ .delete_row = 0 }));
    for ([_]grid.Command{ .{ .insert_row = 3 }, .{ .delete_row = 2 }, .{ .insert_column = 3 }, .{ .delete_column = 2 } }) |edit| {
        try std.testing.expectError(error.InvalidTableGridEdit, transaction.apply(&session, 0, identity, edit));
    }
    const options = session.options;
    session.options.max_output_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, transaction.apply(&session, 0, identity, .{ .delete_row = 0 }));
    session.options = options;
    session.options.max_xml_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, transaction.apply(&session, 0, identity, .{ .delete_column = 0 }));
    session.options = options;
    session.options.max_text_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, transaction.apply(&session, 0, identity, .{ .delete_row = 0 }));
    session.options = options;
    session.options.max_sites = 3;
    try std.testing.expectError(error.LimitExceeded, transaction.apply(&session, 0, identity, .{ .delete_row = 0 }));
    session.options = options;
    try std.testing.expectEqualDeep(values.entries.items, session.sections[0].created_tables.entries.items);
    try expectSaved(&session, before);
    _ = try transaction.apply(&session, 0, identity, .{ .delete_row = 0 });
    _ = try transaction.apply(&session, 0, identity, .{ .delete_column = 0 });
    const singleton = try session.save();
    defer a.free(singleton);
    try std.testing.expectError(error.InvalidTableGridEdit, transaction.apply(&session, 0, identity, .{ .delete_row = 0 }));
    try std.testing.expectError(error.InvalidTableGridEdit, transaction.apply(&session, 0, identity, .{ .delete_column = 0 }));
    try expectSaved(&session, singleton);
}

test "HWPX created table grid OOM preserves native values and exact saved bytes" {
    const source = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(source);
    var original = try editor.open(a, source, .{});
    defer original.deinit();
    const identity = try stage(&original, 1, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2, 2);
    const before = try original.save();
    defer a.free(before);
    for ([_]grid.Command{ .{ .insert_row = 1 }, .{ .delete_row = 0 }, .{ .insert_column = 1 }, .{ .delete_column = 0 } }) |edit| {
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, baseline: *const editor.Session, saved: []const u8, id: u64, operation: grid.Command) !void {
                var session = baseline.*;
                session.allocator = allocator;
                var sections = [_]editor.Section{baseline.sections[0]};
                session.sections = &sections;
                sections[0].created_tables = try baseline.sections[0].created_tables.clone(allocator);
                defer sections[0].created_tables.deinit(allocator);
                errdefer {
                    std.testing.expectEqualDeep(baseline.sections[0].created_tables.entries.items, sections[0].created_tables.entries.items) catch @panic("grid failure changed native values");
                    var inspection = session;
                    inspection.allocator = a;
                    expectSaved(&inspection, saved) catch @panic("grid failure changed saved bytes");
                }
                try std.testing.expect(try transaction.apply(&session, 0, id, operation));
            }
        }.run, .{ &original, before, identity, edit });
    }
    try expectSaved(&original, before);
}

test "HWPX created table grid inserted IDs avoid header masterpage and other generated tables" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var document = try @import("package.zig").inspectDocument(a, seed, .{});
    defer document.deinit(a);
    var header_tree = try document.readHeaderTree(a, .{});
    defer header_tree.deinit(a);
    const end = std.mem.lastIndexOf(u8, header_tree.source, "</hh:head>").?;
    const header = try std.mem.concat(a, u8, &.{ header_tree.source[0..end], "<hp:p xmlns:hp='http://www.hancom.co.kr/hwpml/2011/paragraph' id='2'/></hh:head>" });
    defer a.free(header);
    const fixture = @import("test_package_fixture.zig");
    const source = try fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='m' href='Contents/masterpage0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t/></p:run></p:p></s:sec>" },
        .{ .name = "Contents/masterpage0.xml", .data = "<masterPage id='m' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p id='3'/></p:subList></masterPage>" },
    });
    defer a.free(source);
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    const resources: model.Resources = .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 };
    const identity = try stage(&session, 1, resources, 2, 2);
    _ = try stage(&session, 1, resources, 1, 1);
    try std.testing.expectEqual(@as(u32, 4), generated(&session).cells[0].paragraph_id);
    try std.testing.expectEqual(@as(u32, 8), session.sections[0].created_tables.entries.items[1].table.cells[0].paragraph_id);
    try std.testing.expect(try transaction.apply(&session, 0, identity, .{ .insert_row = 1 }));
    try std.testing.expectEqual(@as(u32, 9), generated(&session).cells[2].paragraph_id);
    try std.testing.expectEqual(@as(u32, 10), generated(&session).cells[3].paragraph_id);
    try reopen(&session, &.{ "가😀<&", "B", "", "", "C", "D", "가😀<&" });
    // Malformed duplicate current identity must be rejected even on deletion.
    const second = &session.sections[0].created_tables.entries.items[1].table;
    const second_identity = second.identity;
    second.identity = identity;
    defer second.identity = second_identity;
    try std.testing.expectError(error.InvalidCreatedTableIdentity, transaction.apply(&session, 0, identity, .{ .delete_row = 0 }));
}

test "HWPX created table grid Noori generated table save reopen and history" {
    const source = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(64 * 1024 * 1024));
    defer a.free(source);
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    var choices = try @import("created_table_resource_options.zig").read(&session);
    defer choices.deinit(a);
    const resources: model.Resources = .{ .paragraph = choices.paragraph[0], .character = choices.character[0], .style = choices.style[0], .border_fill = choices.border_fill[0] };
    const identity = try stage(&session, session.sections[0].first_paragraph, resources, 2, 2);
    var h = try history.History.init(&session, 4, 64 * 1024 * 1024);
    defer h.deinit();
    const before = try session.save();
    defer a.free(before);
    for ([_]grid.Command{ .{ .insert_row = 1 }, .{ .insert_column = 1 }, .{ .delete_row = 0 }, .{ .delete_column = 0 } }) |edit| {
        try std.testing.expect(try h.apply(&session, command(identity, edit)));
    }
    const saved = try session.save();
    defer a.free(saved);
    for (0..4) |_| try std.testing.expect(try h.undo(&session));
    try expectSaved(&session, before);
    for (0..4) |_| try std.testing.expect(try h.redo(&session));
    try expectSaved(&session, saved);
    var opened = try editor.open(a, saved, .{});
    defer opened.deinit();
    const bindings = try @import("table_display_bindings.zig").read(a, &opened, 0);
    defer a.free(bindings);
    const instance = try std.fmt.allocPrint(a, "{d}", .{generated(&session).instance_id});
    defer a.free(instance);
    var matched: usize = 0;
    for (bindings) |binding| {
        const tree = &opened.sections[0].tree;
        const id = (try tree.attributeValue(a, binding.owner.table_node, "", "id")) orelse continue;
        if (!std.mem.eql(u8, id.borrowedNormalizedUtf8() orelse continue, instance)) continue;
        try std.testing.expectEqual(@as(u32, 2), binding.owner.rows);
        try std.testing.expectEqual(@as(u32, 2), binding.owner.columns);
        try std.testing.expectEqual(@as(?u32, 1), binding.owner.cell.row_span);
        try std.testing.expectEqual(@as(?u32, 1), binding.owner.cell.column_span);
        const offset = binding.owner.cell.row.? * 2 + binding.owner.cell.column.?;
        const actual = try opened.anchorText(0, binding.paragraph);
        defer a.free(actual);
        try std.testing.expectEqualStrings(generated(&session).cells[offset].text, actual);
        matched += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), matched);
    try std.testing.expectEqualSlices(u8, source, session.source);
}

test "HWPX created table grid formula document OOM validates saved semantics before commit" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var document = try @import("package.zig").inspectDocument(a, seed, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t/></p:run></p:p>" ++
        "<p:tbl rowCnt='1' colCnt='2'><p:tr>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p id='2'><p:run><p:t>7</p:t></p:run></p:p></p:subList></p:tc>" ++
        "<p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p id='3'><p:run><p:ctrl><p:fieldBegin id='40' type='FORMULA'><p:parameters><p:stringParam name='Command'>=SUM(A1:A1)??%g,;;7</p:stringParam><p:stringParam name='Formula'>=SUM(A1:A1)</p:stringParam><p:stringParam name='ResultFormat'>%g,</p:stringParam><p:stringParam name='LastResult'>7</p:stringParam></p:parameters></p:fieldBegin></p:ctrl><p:t>7</p:t><p:ctrl><p:fieldEnd beginIDRef='40'/></p:ctrl></p:run></p:p></p:subList></p:tc>" ++
        "</p:tr></p:tbl></s:sec>";
    const source = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header.source);
    defer a.free(source);
    var original = try editor.open(a, source, .{});
    defer original.deinit();
    try std.testing.expect(try @import("formula_section_save.zig").hasFormula(a, &original.sections[0].tree));
    const identity = try stage(&original, 1, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2, 2);
    const before = try original.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, baseline: *const editor.Session, saved: []const u8, id: u64) !void {
            var session = baseline.*;
            session.allocator = allocator;
            var sections = [_]editor.Section{baseline.sections[0]};
            session.sections = &sections;
            sections[0].created_tables = try baseline.sections[0].created_tables.clone(allocator);
            defer sections[0].created_tables.deinit(allocator);
            errdefer {
                std.testing.expectEqualDeep(baseline.sections[0].created_tables.entries.items, sections[0].created_tables.entries.items) catch @panic("formula failure changed values");
                var inspection = session;
                inspection.allocator = a;
                expectSaved(&inspection, saved) catch @panic("formula failure changed saved bytes");
            }
            try std.testing.expect(try transaction.apply(&session, 0, id, .{ .insert_row = 1 }));
        }
    }.run, .{ &original, before, identity });
    try expectSaved(&original, before);
}
