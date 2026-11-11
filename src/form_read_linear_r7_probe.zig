const std = @import("std");
const editor = @import("hwpx/editor_session.zig");
const a = std.testing.allocator;
fn fixture(forms: usize, padding: usize) ![]u8 {
    var x: std.ArrayList(u8) = .empty;
    defer x.deinit(a);
    try x.appendSlice(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>");
    for (0..forms) |_| try x.appendSlice(a, "<p:p id='0'><p:run><p:t>BODY</p:t><p:edit name='f' enabled='1' editable='1' readOnly='0' numOnly='0' multiLine='1' maxLength='1000'><p:formCharPr charPrIDRef='0'/><p:text>source😀</p:text></p:edit></p:run></p:p>");
    for (0..padding) |_| try x.appendSlice(a, "<p:p id='0'><p:run><p:t>padding</p:t></p:run></p:p>");
    try x.appendSlice(a, "</s:sec>");
    return @import("hwpx/test_formula_fixture.zig").zipWithSection(a, x.items);
}
fn run(n: usize, padding: usize, mode: enum { source, current, mixed }) !void {
    const bytes = try fixture(n, padding);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var nodes: std.ArrayList(usize) = .empty;
    defer nodes.deinit(a);
    for (s.sections[0].tree.elements, 0..) |_, i| if (@import("hwpx/run_anchor.zig").kind(&s.sections[0].tree, i) == .edit_box) try nodes.append(a, i);
    try std.testing.expectEqual(n, nodes.items.len);
    const edited = if (mode == .source) 0 else if (mode == .mixed) n / 2 else n;
    for (nodes.items[0..edited]) |node| try std.testing.expect(try s.setFormText(0, node, "current😀"));
    const saved = try s.save();
    defer a.free(saved);
    const serial = s.mutation_serial;
    var scope = try @import("hwpx/paragraph_read_scope.zig").Scope.init(&s, 0);
    defer scope.deinit();
    try scope.attach();
    for (nodes.items, 0..) |node, i| {
        const value = try s.formText(0, node);
        defer a.free(value);
        try std.testing.expectEqualStrings(if (i < edited) "current😀" else "source😀", value);
    }
    try std.testing.expectEqual(serial, s.mutation_serial);
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
}
test "R7 actual Session leased form reads source current mixed and fixed F variable tree" {
    for ([_]usize{ 32, 64, 128 }) |n| {
        try run(n, 0, .source);
        try run(n, 0, .current);
        try run(n, 0, .mixed);
    }
    for ([_]usize{ 32, 64, 128 }) |padding| try run(32, padding, .source);
}

fn getNode(s: *const editor.Session, ordinal: usize) !usize {
    var count: usize = 0;
    for (s.sections[0].tree.elements, 0..) |_, i| if (@import("hwpx/run_anchor.zig").kind(&s.sections[0].tree, i) == .edit_box) {
        if (count == ordinal) return i;
        count += 1;
    };
    return error.NoForm;
}
fn expectValue(s: *const editor.Session, node: usize, expected: []const u8) !void {
    const t = try s.formText(0, node);
    defer s.allocator.free(t);
    try std.testing.expectEqualStrings(expected, t);
}
test "R7 context exact differential source CDATA references empty UTF16 and current permission" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:edit enabled='1' editable='1' readOnly='0' numOnly='0' multiLine='1'><p:text><![CDATA[A😀]]>&amp;é</p:text></p:edit><p:edit enabled='0' editable='0' readOnly='1' numOnly='0'><p:text>readonly</p:text></p:edit><p:edit enabled='1' editable='1' readOnly='0' numOnly='0'><p:text/></p:edit></p:run></p:p></s:sec>";
    const b = try @import("hwpx/test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    const first = try getNode(&s, 0);
    const second = try getNode(&s, 1);
    const third = try getNode(&s, 2);
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    for ([_]usize{ first, second, third }) |node| {
        const old = try s.formText(0, node);
        defer a.free(old);
        const new = try c.read(&s, 0, node);
        defer a.free(new);
        try std.testing.expectEqualSlices(u8, old, new);
    }
    try std.testing.expectError(error.FormValueProtected, s.setFormText(0, second, "new"));
    try std.testing.expectError(error.InvalidFormNode, c.read(&s, 0, s.sections[0].tree.elements.len));
    try std.testing.expectError(error.InvalidFormNode, c.read(&s, 0, 2));
}
test "R7 selected duplicate and malformed target order unselected duplicate accepted" {
    const b = try fixture(3, 0);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    const first = try getNode(&s, 0);
    const second = try getNode(&s, 1);
    try s.sections[0].form_texts.entries.append(a, .{ .form_node = second, .text = try a.dupe(u8, "pending") });
    try s.sections[0].form_texts.entries.append(a, .{ .form_node = second, .text = try a.dupe(u8, "pending") });
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    const value = try c.read(&s, 0, first);
    defer a.free(value);
    try std.testing.expectEqualStrings("source😀", value);
    try std.testing.expectError(error.DuplicateFormTextEdit, s.formText(0, second));
    try std.testing.expectError(error.DuplicateFormTextEdit, c.read(&s, 0, second));
    // Error order is source target before selected duplicate.
    var tree = &s.sections[0].tree;
    const leaf = try @import("hwpx/form_text_source.zig").target(tree, second);
    const saved = tree.elements[second].first_child;
    tree.elements[second].first_child = null;
    defer tree.elements[second].first_child = saved;
    try std.testing.expectError(error.MissingFormText, c.read(&s, 0, second));
    _ = leaf;
}
test "R7 request identity serial and copied owner stale without borrowing released pending" {
    const b = try fixture(2, 0);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    const node = try getNode(&s, 0);
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    const t = try c.read(&s, 0, node);
    a.free(t);
    var proxy = s;
    try std.testing.expectError(error.StaleParagraphReadScope, c.read(&proxy, 0, node));
    try std.testing.expect(try s.setFormText(0, node, "current😀"));
    try std.testing.expectError(error.StaleParagraphReadScope, c.read(&s, 0, node));
    var fresh = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer fresh.deinit();
    const text = try fresh.read(&s, 0, node);
    defer a.free(text);
    try std.testing.expectEqualStrings("current😀", text);
}
test "R7 managed history current source undo ABA redo exact bytes no retained context" {
    const b = try fixture(2, 0);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    const node = try getNode(&s, 0);
    const H = @import("hwpx/editor_history.zig");
    var h = try H.History.initV2(&s, .{});
    defer h.deinit();
    var old = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer old.deinit();
    const first = try old.read(&s, 0, node);
    a.free(first);
    const cmd: H.Command = .{ .kind = .form_text, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "CURRENT😀", .form_node = node };
    try std.testing.expect(try h.applyBatch(&s, &.{cmd}));
    const changed = try s.save();
    defer a.free(changed);
    try std.testing.expectError(error.StaleParagraphReadScope, old.read(&s, 0, node));
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectError(error.StaleParagraphReadScope, old.read(&s, 0, node));
    const before = try s.save();
    defer a.free(before);
    try std.testing.expectEqualSlices(u8, b, before);
    {
        var scope = try @import("hwpx/paragraph_read_scope.zig").Scope.init(&s, 0);
        defer scope.deinit();
        try scope.attach();
        try expectValue(&s, node, "source😀");
    }
    try std.testing.expect(s.form_read_context == null);
    try std.testing.expect(try h.redo(&s));
    {
        var scope = try @import("hwpx/paragraph_read_scope.zig").Scope.init(&s, 0);
        defer scope.deinit();
        try scope.attach();
        try expectValue(&s, node, "CURRENT😀");
    }
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
    var reopened = try editor.open(a, redone, .{});
    defer reopened.deinit();
    try expectValue(&reopened, try getNode(&reopened, 0), "CURRENT😀");
}
test "R7 read allocation failures preserve Native original pending and serial" {
    const b = try fixture(2, 0);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    const node = try getNode(&s, 0);
    try std.testing.expect(try s.setFormText(0, node, "current😀"));
    const saved = try s.save();
    defer a.free(saved);
    const ptr = s.sections[0].form_texts.entries.items[0].text.ptr;
    const serial = s.mutation_serial;
    var attempts: usize = 0;
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, session: *editor.Session, count: *usize) !void {
            count.* += 1;
            const previous = session.allocator;
            session.allocator = allocator;
            defer session.allocator = previous;
            var c = @import("hwpx/form_read_context.zig").Context.init(session, 0);
            defer c.deinit();
            for ([_]usize{ 0, 1 }) |i| {
                const value = try c.read(session, 0, try getNode(session, i));
                allocator.free(value);
            }
        }
    }.run, .{ &s, &attempts });
    std.debug.print("R7 read OOM attempts={d}\n", .{attempts});
    try std.testing.expect(s.form_read_context == null);
    try std.testing.expectEqual(ptr, s.sections[0].form_texts.entries.items[0].text.ptr);
    try std.testing.expectEqual(serial, s.mutation_serial);
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
}

test "R7 form sites exact legacy differential source pending split merge and allocation failures" {
    const b = try fixture(3, 0);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    const Check = struct {
        fn compare(session: *editor.Session) !void {
            const old = try @import("hwpx/form_display_sites_legacy_r7_test.zig").read(a, session, 0);
            defer a.free(old);
            const new = try @import("hwpx/form_display_sites.zig").read(a, session, 0);
            defer a.free(new);
            try std.testing.expectEqual(old.len, new.len);
            for (old, new) |x, y| {
                try std.testing.expectEqual(x.formNode, y.formNode);
                try std.testing.expectEqual(x.kind, y.kind);
                try std.testing.expectEqual(x.paragraph, y.paragraph);
                try std.testing.expectEqual(x.anchorUnit, y.anchorUnit);
                try std.testing.expectEqual(@backingInt(x.state), @backingInt(y.state));
            }
        }
    };
    try Check.compare(&s);
    try std.testing.expect(try s.setFormText(0, try getNode(&s, 0), "pending😀"));
    try Check.compare(&s);
    try std.testing.expect(try s.splitParagraphAnchored(0, 1, 2, 0));
    try Check.compare(&s);
    try std.testing.expect(try s.mergeParagraph(0, 1));
    try Check.compare(&s);
    // Allocation failure checks the new query only; the independent expected rows
    // are prepared outside the injection interval and own no mutable document state.
    const expected = try @import("hwpx/form_display_sites.zig").read(a, &s, 0);
    defer a.free(expected);
    var attempts: usize = 0;
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, session: *editor.Session, count: *usize) !void {
            count.* += 1;
            const rows = try @import("hwpx/form_display_sites.zig").read(allocator, session, 0);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 3), rows.len);
        }
    }.run, .{ &s, &attempts });
    std.debug.print("R7 form sites OOM attempts={d}\n", .{attempts});
}

test "R7 host indexed exact protected split duplicate mixed missing joined semantics" {
    const b = try fixture(2, 0);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    const tree = &s.sections[0].tree;
    const n0 = try getNode(&s, 0);
    const n1 = try getNode(&s, 1);
    const t0 = try @import("hwpx/paragraph_site_owner.zig").ancestor(tree, n0);
    const t1 = try @import("hwpx/paragraph_site_owner.zig").ancestor(tree, n1);
    const P = @import("hwpx/paragraph_structure_values.zig");
    var p0 = [_]P.ProtectedPosition{.{ .element_index = n0, .unit = 0, .kind = .anchor }};
    var p1 = [_]P.ProtectedPosition{.{ .element_index = n1, .unit = 0, .kind = .anchor }};
    var pieces = [_]@import("hwpx/paragraph_joined_values.zig").Piece{ .{ .template_element = t0, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = 0 }, .{ .template_element = t1, .source_ordinal = 2, .generated_id = null, .first_site = 0, .site_count = 0 } };
    var rows = [_]P.Paragraph{ .{ .template_element = t0, .source_ordinal = 1, .sites = .{ .items = &.{} }, .pieces = &pieces, .protected_positions = &p0 }, .{ .template_element = t0, .source_ordinal = null, .generated_id = 5, .sites = .{ .items = &.{} }, .pieces = &pieces, .protected_positions = &p1 } };
    const Check = struct {
        fn check(t: *const @import("hwpx/xml_part_tree.zig").Tree, pp: []const P.Paragraph, template: usize, node: usize) !void {
            var index = try @import("hwpx/form_display_index.zig").Index.init(a, t, pp);
            defer index.deinit();
            const old = @import("hwpx/protected_display_host.zig").currentAnchorOrdinal(pp, 3, template, node);
            if (old) |value| {
                try std.testing.expectEqual(value, try index.ordinal(3, template, node));
            } else |err| try std.testing.expectError(err, index.ordinal(3, template, node));
        }
    };
    try Check.check(tree, &rows, t0, n0);
    try Check.check(tree, &rows, t1, n1);
    // Form sites always supplies the immutable Native owner of the anchor.
    // A cross-owner pair is not an admitted input to this internal index.
    rows[1].protected_positions = &p0;
    try Check.check(tree, &rows, t0, n0);
    rows[1].protected_positions = null;
    try Check.check(tree, &rows, t0, n0);
    rows[0].protected_positions = null;
    try Check.check(tree, &rows, t0, n0);
}

test "R7 current override permission Unicode limit and unrelated invalid entry differential" {
    const b = try fixture(3, 0);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    const n0 = try getNode(&s, 0);
    const n1 = try getNode(&s, 1);
    try s.sections[0].form_texts.entries.append(a, .{ .form_node = n1, .text = try a.dupe(u8, "\xff") });
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    const good = try c.read(&s, 0, n0);
    a.free(good);
    try std.testing.expectError(error.InvalidUnicodeEncoding, s.formText(0, n1));
    try std.testing.expectError(error.InvalidUnicodeEncoding, c.read(&s, 0, n1));
    // Existing read ignores the writer/aggregate text limit; do not turn this
    // optimization into a new budget-based unknown or permission decision.
    s.options.max_text_bytes = 1;
    const text = try c.read(&s, 0, n0);
    defer a.free(text);
    try std.testing.expectEqualStrings("source😀", text);
}

test "R7 read-only request handles inactive form and missing paragraph owner exactly" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:switch><p:case required-namespace='urn:unsupported'><p:edit><p:text>inactive</p:text></p:edit></p:case><p:default><p:t>active</p:t></p:default></p:switch><p:t><p:edit><p:text>intext</p:text></p:edit></p:t></p:run></p:p></s:sec>";
    const b = try @import("hwpx/test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(b);
    var s = try editor.open(a, b, .{});
    defer s.deinit();
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    for (s.sections[0].tree.elements, 0..) |element, i| if (element.is(@import("hwpx/document_xml.zig").paragraph_uri, "edit")) {
        const old = s.formText(0, i);
        if (old) |value| {
            defer a.free(value);
            const current = try c.read(&s, 0, i);
            defer a.free(current);
            try std.testing.expectEqualSlices(u8, value, current);
        } else |err| try std.testing.expectError(err, c.read(&s, 0, i));
    };
}

test "R7 late protected transaction rollback retains pending value redo and original bytes" {
    const bytes = try fixture(2, 0);
    defer a.free(bytes);
    // Constructor-derived immutable permission, never toggled after indexing.
    const protected = try @import("hwpx/test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>BODY</p:t><p:edit enabled='1' editable='1' readOnly='0' numOnly='0'><p:text>source😀</p:text></p:edit><p:edit enabled='1' editable='0' readOnly='1' numOnly='0'><p:text>protected😀</p:text></p:edit></p:run></p:p></s:sec>");
    defer a.free(protected);
    var s = try editor.open(a, protected, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    const n0 = try getNode(&s, 0);
    const n1 = try getNode(&s, 1);
    const H = @import("hwpx/editor_history.zig");
    var h = try H.History.initV2(&s, .{});
    defer h.deinit();
    const edit: H.Command = .{ .kind = .form_text, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "first😀", .form_node = n0 };
    try std.testing.expect(try h.applyBatch(&s, &.{edit}));
    const expected = try s.save();
    defer a.free(expected);
    try std.testing.expect(try h.undo(&s));
    var denied = edit;
    denied.form_node = n1;
    try std.testing.expectError(error.FormValueProtected, h.applyBatch(&s, &.{ edit, denied }));
    const original = try s.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, protected, original);
    {
        var scope = try @import("hwpx/paragraph_read_scope.zig").Scope.init(&s, 0);
        defer scope.deinit();
        try scope.attach();
        try expectValue(&s, n0, "source😀");
        try expectValue(&s, n1, "protected😀");
    }
    try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, expected, redone);
}
