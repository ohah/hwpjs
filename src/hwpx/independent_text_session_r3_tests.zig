const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");
const Edit = @import("../model/independent_text_edits.zig").Edit;
const a = std.testing.allocator;
fn command(paragraph: usize, edits: []const Edit) history_mod.Command {
    return .{ .kind = .independent_text, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .independent_text_edits = edits };
}
fn input(paragraphs: []const u8) ![]u8 {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var session = try editor.open(a, seed, .{});
    defer session.deinit();
    const section = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", paragraphs, "</s:sec>" });
    defer a.free(section);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, session.original_header.?.source);
}
const plain = "<p:p id='10' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0' keep='attr'><p:t>A😀BC</p:t></p:run></p:p><p:p id='20' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>OTHER</p:t></p:run></p:p>";
fn expectText(s: *editor.Session, p: usize, wanted: []const u8) !void {
    const text = try s.anchorText(0, p);
    defer s.allocator.free(text);
    try std.testing.expectEqualStrings(wanted, text);
}
test "HX independent session r3 real HistoryV2 multi paragraph one undo redo save reopen" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try history_mod.History.initV2(&session, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer history.deinit();
    try std.testing.expect(try history.applyBatch(&session, &.{ command(1, &.{ .{ .start = 0, .end = 1, .text = "X", .expected = "A" }, .{ .start = 1, .end = 3, .text = "👾", .expected = "😀" } }), command(2, &.{.{ .start = 0, .end = 5, .text = "NEXT", .expected = "OTHER" }}) }));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    try expectText(&session, 1, "X👾BC");
    try expectText(&session, 2, "NEXT");
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectText(&reopened, 1, "X👾BC");
    try expectText(&reopened, 2, "NEXT");
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, bytes, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

fn openManaged(allocator: std.mem.Allocator, bytes: []const u8) !editor.Session {
    var s = try editor.open(allocator, bytes, .{});
    s.history_delta_managed = true;
    return s;
}
fn expectSaved(s: *editor.Session, wanted: []const u8) !void {
    const bytes = try s.save();
    defer s.allocator.free(bytes);
    try std.testing.expectEqualSlices(u8, wanted, bytes);
}
test "HX independent session r3 noops keep source ownership and same text style moves remain revision" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    const before = h.stats();
    try std.testing.expect(!try h.apply(&s, command(1, &.{.{ .start = 0, .end = 5, .text = "A😀BC", .expected = "A😀BC" }})));
    try std.testing.expectEqual(before.revision, h.stats().revision);
    try std.testing.expect(s.sections[0].structure_values == null);
    try expectSaved(&s, bytes);
    try std.testing.expect(try h.apply(&s, command(2, &.{ .{ .start = 0, .end = 1, .text = "" }, .{ .start = 1, .end = 5, .text = "OTHER" } })));
    try expectText(&s, 2, "OTHER");
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    try std.testing.expect(try h.undo(&s));
    try expectSaved(&s, bytes);
    try std.testing.expect(try h.redo(&s));
    try expectText(&s, 2, "OTHER");
}

test "HX independent session r3 late existing command failure uses History rollback and preserves redo" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expect(try h.apply(&s, command(2, &.{.{ .start = 0, .end = 5, .text = "NEXT" }})));
    try std.testing.expect(try h.undo(&s));
    const rev = h.revision();
    const count = h.revisionCount();
    try std.testing.expectError(error.InvalidTextPosition, h.applyBatch(&s, &.{ command(1, &.{.{ .start = 0, .end = 1, .text = "X" }}), .{ .kind = .plain, .paragraph = 2, .start = 999, .deleted = 0, .inserted = "bad" } }));
    try std.testing.expectEqual(rev, h.revision());
    try std.testing.expectEqual(count, h.revisionCount());
    try expectSaved(&s, bytes);
    try std.testing.expect(!h.stats().poisoned);
    try std.testing.expect(try h.redo(&s));
    try expectText(&s, 2, "NEXT");
}

test "HX independent session r3 expected scalar invalid late range budget and stale context reject" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expectError(error.ExpectedTextMismatch, h.applyBatch(&s, &.{ command(2, &.{.{ .start = 0, .end = 1, .text = "X" }}), command(1, &.{.{ .start = 1, .end = 3, .text = "Y", .expected = "👾" }}) }));
    try std.testing.expectError(error.SplitSurrogatePair, h.apply(&s, command(1, &.{.{ .start = 2, .end = 3, .text = "Z" }})));
    try std.testing.expectError(error.InvalidTextPosition, h.apply(&s, command(1, &.{.{ .start = 99, .end = 99, .text = "Z" }})));
    try std.testing.expectError(error.OverlappingTextEdits, h.apply(&s, command(2, &.{ .{ .start = 0, .end = 2, .text = "X" }, .{ .start = 1, .end = 3, .text = "Z" } })));
    try expectSaved(&s, bytes);
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    var context = try @import("independent_text_session.zig").Context.init(&s);
    defer context.deinit();
    _ = try context.apply(0, 2, &.{.{ .start = 0, .end = 1, .text = "X" }});
    s.sections[0].sites.items[0].text[0] = 'Q';
    try std.testing.expectError(error.StaleIndependentTextContext, context.finish());
    s.sections[0].sites.items[0].text[0] = 'A';
    var stale = try @import("independent_text_session.zig").Context.init(&s);
    defer stale.deinit();
    s.mutation_serial += 1;
    try std.testing.expectError(error.StaleIndependentTextContext, stale.apply(0, 1, &.{.{ .start = 0, .end = 1, .text = "X" }}));
    s.mutation_serial -= 1;
    try expectSaved(&s, bytes);
    try std.testing.expect(try s.splice(0, 2, 0, 1, "D"));
    try std.testing.expectError(error.HistoryCurrentMismatch, h.apply(&s, command(1, &.{.{ .start = 0, .end = 1, .text = "X" }})));
    try expectText(&s, 2, "DTHER");
}

test "HX independent session r3 global byte budget final group total no prefix limit artifact" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    s.options.max_text_bytes = 12;
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expect(try h.applyBatch(&s, &.{ command(1, &.{.{ .start = 0, .end = 1, .text = "XXXX" }}), command(2, &.{.{ .start = 0, .end = 3, .text = "" }}) }));
    try expectText(&s, 1, "XXXX😀BC");
    try expectText(&s, 2, "ER");
    try std.testing.expect(try h.undo(&s));
    try expectSaved(&s, bytes);
    try std.testing.expectError(error.LimitExceeded, h.apply(&s, command(1, &.{.{ .start = 0, .end = 1, .text = "XXXX" }})));
    try expectSaved(&s, bytes);
    try std.testing.expect(try h.redo(&s));
    try expectText(&s, 1, "XXXX😀BC");
}

test "HX independent session r3 generated joined and original nested owners before first save" {
    const bytes = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 24, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expect(try h.apply(&s, .{ .kind = .plain, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "HEADER" }));
    try std.testing.expect(try h.apply(&s, .{ .kind = .split, .paragraph = 1, .start = 6, .deleted = 0, .inserted = "" }));
    try std.testing.expect(try h.apply(&s, .{ .kind = .plain, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "A😀BC" }));
    try std.testing.expect(s.sections[0].structure_values.?.paragraphs[1].source_ordinal == null);
    try std.testing.expect(try h.apply(&s, command(2, &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 1, .end = 3, .text = "👾" } })));
    try expectText(&s, 2, "X👾BC");
    try std.testing.expect(try h.apply(&s, .{ .kind = .split, .paragraph = 2, .start = 3, .deleted = 0, .inserted = "" }));
    try std.testing.expect(try h.apply(&s, .{ .kind = .merge, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expect(try h.apply(&s, command(2, &.{ .{ .start = 0, .end = 1, .text = "Y" }, .{ .start = 3, .end = 5, .text = "Z" } })));
    try expectText(&s, 2, "Y👾Z");
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectText(&reopened, 2, "Y👾Z");
    // Source nested paragraphs use the same policy and original tree provenance;
    // there is no generated-BODY-only admission rule.
    const nested = try input("<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>HOST</p:t><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>CELL😀</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p>");
    defer a.free(nested);
    var n = try openManaged(a, nested);
    defer n.deinit();
    var nh = try history_mod.History.initV2(&n, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer nh.deinit();
    try std.testing.expect(try nh.apply(&n, command(2, &.{ .{ .start = 0, .end = 4, .text = "NEST", .expected = "CELL" }, .{ .start = 4, .end = 6, .text = "👾", .expected = "😀" } })));
    try expectText(&n, 2, "NEST👾");
    const ns = try n.save();
    defer a.free(ns);
    var nr = try editor.open(a, ns, .{});
    defer nr.deinit();
    try expectText(&nr, 2, "NEST👾");
}

test "HX independent session r3 distinct source templates joined current before save" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expect(try h.apply(&s, .{ .kind = .merge, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expect(s.sections[0].structure_values.?.paragraphs[0].pieces != null);
    var control = try openManaged(a, bytes);
    defer control.deinit();
    var ch = try history_mod.History.initV2(&control, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer ch.deinit();
    _ = try ch.apply(&control, .{ .kind = .merge, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" });
    const before = try control.save();
    defer a.free(before);
    try std.testing.expect(try h.apply(&s, command(1, &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 5, .end = 10, .text = "NEXT", .expected = "OTHER" } })));
    try expectText(&s, 1, "X😀BCNEXT");
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectText(&reopened, 1, "X😀BCNEXT");
    try std.testing.expect(try h.undo(&s));
    try expectSaved(&s, before);
    try std.testing.expect(try h.redo(&s));
    try expectSaved(&s, saved);
}

test "HX independent session r3 retained controls protected positions source and generated" {
    const bytes = try input("<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>A<p:tab/>B</p:t><p:pic/><p:t>C😀D</p:t></p:run></p:p>");
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expectError(error.ProtectedInlineControl, h.apply(&s, command(1, &.{.{ .start = 1, .end = 2, .text = "\t" }})));
    try std.testing.expect(s.sections[0].structure_values == null);
    try std.testing.expect(try h.apply(&s, command(1, &.{ .{ .start = 0, .end = 1, .text = "AAA" }, .{ .start = 5, .end = 7, .text = "X" } })));
    try expectText(&s, 1, "AAA\tB\xef\xbf\xbcCXD");
    try std.testing.expect(try h.apply(&s, .{ .kind = .split_anchored, .paragraph = 1, .start = 3, .deleted = 0, .inserted = "" }));
    try std.testing.expect(try h.apply(&s, command(2, &.{.{ .start = 1, .end = 2, .text = "BB" }})));
    try expectText(&s, 2, "\tBB\xef\xbf\xbcCXD");
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectText(&reopened, 2, "\tBB\xef\xbf\xbcCXD");
}

test "HX independent session r3 field title tracking explicit rejection and unrelated paragraph allowed" {
    const bytes = try input("<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:ctrl><p:fieldBegin id='7' type='HYPERLINK'/></p:ctrl><p:t>FIELD</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:run></p:p><p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>SAFE</p:t></p:run></p:p><p:p id='3' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>TITLE<p:titleMark ignore='1'/></p:t></p:run></p:p><p:p id='4' paraPrIDRef='0' styleIDRef='0' paraTcId='2'><p:run charPrIDRef='0'><p:t>TRACK</p:t></p:run></p:p>");
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expectError(error.UnsupportedIndependentFieldMetadata, h.apply(&s, command(1, &.{.{ .start = 0, .end = 1, .text = "X" }})));
    try std.testing.expectError(error.UnsupportedIndependentTitleMetadata, h.apply(&s, command(3, &.{.{ .start = 0, .end = 1, .text = "X" }})));
    try std.testing.expectError(error.UnsupportedParagraphTracking, h.apply(&s, command(4, &.{.{ .start = 0, .end = 1, .text = "X" }})));
    try expectSaved(&s, bytes);
    try std.testing.expect(try h.apply(&s, command(2, &.{.{ .start = 0, .end = 4, .text = "OK", .expected = "SAFE" }})));
    try expectText(&s, 2, "OK");
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectText(&reopened, 2, "OK");
}

fn styleInput() ![]u8 {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var s = try editor.open(a, seed, .{});
    defer s.deinit();
    const header = &s.original_header.?;
    var char: ?[]const u8 = null;
    for (header.elements, 0..) |element, i| if (element.is(@import("document_xml.zig").head_uri, "charPr")) {
        char = header.sourceOf(i);
        break;
    };
    const id = try std.mem.replaceOwned(u8, a, char.?, "id=\"0\"", "id=\"1\"");
    defer a.free(id);
    const bold = try std.mem.replaceOwned(u8, a, id, "</hh:charPr>", "<hh:bold/></hh:charPr>");
    defer a.free(bold);
    const extra = try std.mem.concat(a, u8, &.{ bold, "</hh:charProperties>" });
    defer a.free(extra);
    const inserted = try std.mem.replaceOwned(u8, a, header.source, "</hh:charProperties>", extra);
    defer a.free(inserted);
    const final_header = try std.mem.replaceOwned(u8, a, inserted, "charProperties itemCnt=\"1\"", "charProperties itemCnt=\"2\"");
    defer a.free(final_header);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0' unknown='KEEP'><p:t>A</p:t></p:run><p:run charPrIDRef='1'><p:t>B</p:t></p:run></p:p></s:sec>", final_header);
}
test "HX independent session r3 same text distinct style sites noops versus real redistribution" {
    const bytes = try styleInput();
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    const snapshot = @import("character_style_snapshot.zig");
    const original = try snapshot.read(&s, 0, 1);
    defer a.free(original);
    try std.testing.expectEqual(@as(?u32, 1), original[1].char_shape_id);
    try std.testing.expect(!try h.apply(&s, command(1, &.{.{ .start = 0, .end = 2, .text = "AB", .expected = "AB" }})));
    try std.testing.expect(s.sections[0].structure_values == null);
    try std.testing.expect(try h.apply(&s, command(1, &.{ .{ .start = 0, .end = 1, .text = "" }, .{ .start = 1, .end = 2, .text = "AB" } })));
    try expectText(&s, 1, "AB");
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    const rows = try snapshot.read(&s, 0, 1);
    defer a.free(rows);
    // The unpublished independent contract inherits the first replaced source
    // character. Two effective edits restoring whole text still move its style.
    try std.testing.expectEqual(@as(usize, 0), rows[0].end_unit);
    try std.testing.expectEqual(@as(?u32, 1), rows[1].char_shape_id);
    try std.testing.expectEqual(@as(usize, 2), rows[1].end_unit);
    var single = try editor.open(a, bytes, .{});
    defer single.deinit();
    try std.testing.expect(try single.splice(0, 1, 1, 1, "AB"));
    try std.testing.expect(try single.splice(0, 1, 0, 1, ""));
    const legacy = try snapshot.read(&single, 0, 1);
    defer a.free(legacy);
    // Single splice stays on its existing left-affine contract.
    try std.testing.expectEqual(@as(?u32, 0), legacy[0].char_shape_id);
    try std.testing.expectEqual(@as(usize, 2), legacy[0].end_unit);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectText(&reopened, 1, "AB");
    try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "unknown='KEEP'") != null);
    try std.testing.expect(try h.undo(&s));
    try expectSaved(&s, bytes);
    try std.testing.expect(try h.redo(&s));
    try expectSaved(&s, saved);
}

test "HX independent session r3 original nested note drawing caption header source policies" {
    const pairs = [_][2][]const u8{
        .{ "<p:ctrl><p:footNote><p:subList>", "</p:subList></p:footNote></p:ctrl>" },
        .{ "<p:rect><p:drawText><p:subList>", "</p:subList></p:drawText></p:rect>" },
        .{ "<p:tbl rowCnt='1' colCnt='1'><p:caption><p:subList>", "</p:subList></p:caption></p:tbl>" },
        .{ "<p:secPr><p:header><p:subList>", "</p:subList></p:header></p:secPr>" },
    };
    for (pairs) |pair| {
        const xml = try std.mem.concat(a, u8, &.{ "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>HOST</p:t>", pair[0], "<p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>NEST😀</p:t></p:run></p:p>", pair[1], "</p:run></p:p>" });
        defer a.free(xml);
        const bytes = try input(xml);
        defer a.free(bytes);
        var s = try openManaged(a, bytes);
        defer s.deinit();
        try std.testing.expect(try s.canEdit(0, 2));
        var h = try history_mod.History.initV2(&s, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
        defer h.deinit();
        try std.testing.expect(try h.apply(&s, command(2, &.{ .{ .start = 0, .end = 4, .text = "NEXT" }, .{ .start = 4, .end = 6, .text = "👾" } })));
        try expectText(&s, 2, "NEXT👾");
        const saved = try s.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        try expectText(&reopened, 2, "NEXT👾");
        try std.testing.expect(try h.undo(&s));
        try expectSaved(&s, bytes);
    }
}

fn largeInput(n: usize, multi: bool) ![]u8 {
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    if (multi) {
        for (0..n) |i| {
            const row = try std.fmt.allocPrint(a, "<p:p id='{d}' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>ab</p:t></p:run></p:p>", .{i + 1});
            defer a.free(row);
            try text.appendSlice(a, row);
        }
    } else {
        try text.appendSlice(a, "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>");
        for (0..n) |_| try text.appendSlice(a, "ab");
        try text.appendSlice(a, "</p:t></p:run></p:p>");
    }
    return input(text.items);
}
test "HX independent session r3 N 2N 4N shared source policy budget view one section preparation" {
    for ([_]bool{ false, true }) |multi| {
        var previous: usize = 0;
        for ([_]usize{ 64, 128, 256 }) |n| {
            const bytes = try largeInput(n, multi);
            defer a.free(bytes);
            var s = try openManaged(a, bytes);
            defer s.deinit();
            var context = try @import("independent_text_session.zig").Context.init(&s);
            defer context.deinit();
            if (multi) {
                for (0..n) |i| _ = try context.apply(0, i + 1, &.{.{ .start = 0, .end = 1, .text = "X", .expected = "a" }});
            } else {
                const edits = try a.alloc(Edit, n);
                defer a.free(edits);
                for (edits, 0..) |*edit, i| edit.* = .{ .start = @intCast(i * 2), .end = @intCast(i * 2 + 1), .text = "X", .expected = "a" };
                _ = try context.apply(0, 1, edits);
            }
            const work = context.work;
            try std.testing.expectEqual(@as(usize, 1), work.section_builds);
            try std.testing.expectEqual(n, work.edits);
            try std.testing.expectEqual(if (multi) n else @as(usize, 1), work.paragraphs);
            try std.testing.expectEqual(s.sections[0].tree.elements.len, work.nodes);
            const total = work.global_sites + work.section_builds + work.nodes + work.paragraphs + work.edits;
            if (previous != 0) try std.testing.expect(total <= previous * 2 + 8);
            previous = total;
            std.debug.print("SESSION_WORK multi={} N={d} total={d} globalSites={d} builds={d} nodes={d} paragraphs={d} edits={d}\n", .{ multi, n, total, work.global_sites, work.section_builds, work.nodes, work.paragraphs, work.edits });
            try std.testing.expect(s.sections[0].structure_values == null);
            // Same real History path, separate from preparation measurement.
            var h = try history_mod.History.initV2(&s, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
            defer h.deinit();
            const commands = try a.alloc(history_mod.Command, if (multi) n else 1);
            defer a.free(commands);
            const edits = try a.alloc(Edit, n);
            defer a.free(edits);
            for (edits, 0..) |*edit, i| edit.* = .{ .start = if (multi) 0 else @intCast(i * 2), .end = if (multi) 1 else @intCast(i * 2 + 1), .text = "X" };
            if (multi) {
                for (commands, 0..) |*cmd, i| cmd.* = command(i + 1, edits[i .. i + 1]);
            } else commands[0] = command(1, edits);
            try std.testing.expect(try h.applyBatch(&s, commands));
            try std.testing.expectEqual(@as(u32, 1), h.revision());
            try std.testing.expect(try h.undo(&s));
            try expectSaved(&s, bytes);
            try std.testing.expect(try h.redo(&s));
        }
    }
}

test "HX independent session r3 exhaustive selected HistoryV2 OOM rollback redo or existing poison owner" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var measured: usize = 0;
    var sample: usize = 0;
    var rejected: usize = 0;
    var poisoned: usize = 0;
    while (sample == 0 or sample <= measured) : (sample += 1) {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var s = try openManaged(fa, bytes);
        defer s.deinit();
        var h = try history_mod.History.initV2(&s, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
        defer h.deinit();
        try std.testing.expect(try h.apply(&s, command(2, &.{.{ .start = 0, .end = 5, .text = "NEXT" }})));
        try std.testing.expect(try h.undo(&s));
        const revision = h.revision();
        const count = h.revisionCount();
        const before = failing.alloc_index;
        if (sample != 0) failing.fail_index = before + sample - 1;
        const changed = h.apply(&s, command(1, &.{ .{ .start = 0, .end = 1, .text = "X", .expected = "A" }, .{ .start = 1, .end = 3, .text = "👾", .expected = "😀" } })) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            rejected += 1;
            try std.testing.expectEqual(revision, h.revision());
            try std.testing.expectEqual(count, h.revisionCount());
            if (h.stats().poisoned) {
                poisoned += 1;
                try std.testing.expectEqual(error.MutationUncertain, err);
                try std.testing.expectError(error.HistoryMutationUncertain, h.redo(&s));
            } else {
                try std.testing.expectEqual(error.OutOfMemory, err);
                try expectSaved(&s, bytes);
                try std.testing.expect(try h.redo(&s));
                try expectText(&s, 2, "NEXT");
            }
            if (sample % 256 == 0) std.debug.print("SESSION_OOM progress={d}/{d} rejected={d} poisoned={d}\n", .{ sample, measured, rejected, poisoned });
            continue;
        };
        try std.testing.expect(sample == 0);
        try std.testing.expect(changed);
        measured = failing.alloc_index - before;
        try std.testing.expect(measured > 0 and measured < 20_000);
        try expectText(&s, 1, "X👾BC");
    }
    try std.testing.expectEqual(measured, rejected);
    std.debug.print("SESSION_OOM exhaustive_points={d} rejected={d} existing_poison={d} restored_redo={d}\n", .{ measured, rejected, poisoned, rejected - poisoned });
}

test "HX independent session r3 cross paragraph field scopes and exact unsupported metadata inventory" {
    const bytes = try input("<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:ctrl><p:fieldBegin id='7' type='HYPERLINK'/></p:ctrl><p:t>LEFT</p:t></p:run></p:p><p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>MIDDLE</p:t></p:run></p:p><p:p id='3' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>RIGHT</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:run></p:p><p:p id='4' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>SAFE</p:t></p:run></p:p>");
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var h = try history_mod.History.initV2(&s, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expectError(error.UnsupportedIndependentFieldMetadata, h.apply(&s, command(2, &.{.{ .start = 0, .end = 1, .text = "X" }})));
    try expectSaved(&s, bytes);
    try std.testing.expect(try h.apply(&s, command(4, &.{.{ .start = 0, .end = 4, .text = "OK" }})));
    try expectText(&s, 4, "OK");
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectText(&reopened, 4, "OK");
    try std.testing.expect(try h.undo(&s));
    try expectSaved(&s, bytes);
    const cases = .{
        .{ error.UnsupportedIndependentRunlessParagraph, "<p:p id='1' paraPrIDRef='0' styleIDRef='0'/>" },
        .{ error.UnsupportedIndependentPageMetadata, "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:ctrl><p:pageNum/></p:ctrl><p:t>A</p:t></p:run></p:p>" },
        .{ error.UnsupportedIndependentColumnMetadata, "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>A</p:t><p:ctrl><p:colPr/></p:ctrl><p:t>B</p:t></p:run></p:p>" },
    };
    inline for (cases) |case| {
        const input_bytes = try input(case[1]);
        defer a.free(input_bytes);
        var doc = try openManaged(a, input_bytes);
        defer doc.deinit();
        var hist = try history_mod.History.initV2(&doc, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
        defer hist.deinit();
        try std.testing.expectError(case[0], hist.apply(&doc, command(1, &.{.{ .start = 0, .end = 0, .text = "X" }})));
        try expectSaved(&doc, input_bytes);
        try std.testing.expectEqual(@as(u32, 0), hist.revision());
    }
}

test "HX independent session r3 context cannot commit managed Session outside owned History frame" {
    const bytes = try input(plain);
    defer a.free(bytes);
    var s = try openManaged(a, bytes);
    defer s.deinit();
    var context = try @import("independent_text_session.zig").Context.init(&s);
    defer context.deinit();
    _ = try context.apply(0, 1, &.{.{ .start = 0, .end = 1, .text = "X" }});
    try std.testing.expectError(error.IndependentTextRequiresHistory, context.finish());
    try std.testing.expect(s.sections[0].structure_values == null);
    try expectSaved(&s, bytes);
}
