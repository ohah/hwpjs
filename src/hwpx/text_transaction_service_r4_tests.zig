//! Bounded constructor-only typed Service tests; actual Session + owned History.
const std = @import("std");
const editor = @import("editor_session.zig");
const hist = @import("editor_history.zig");
const tx = @import("text_transaction.zig");
const m = @import("../model/text_transaction.zig");
const f = @import("../model/formatting_patch.zig");
const refs = @import("../model/text_transaction_binding.zig");
const State = @import("../model/formatting_binding.zig").State;
const a = std.testing.allocator;
const plain = "<p:p id='10' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0' keep='opaque'><p:t>A😀BC</p:t></p:run></p:p><p:p id='20' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>OTHER</p:t></p:run></p:p>";
fn input(allocator: std.mem.Allocator, paragraphs: []const u8) ![]u8 {
    const seed = try @import("../new_document/root.zig").hwpx(allocator);
    defer allocator.free(seed);
    var session = try editor.open(allocator, seed, .{});
    defer session.deinit();
    const xml = try std.mem.concat(allocator, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", paragraphs, "</s:sec>" });
    defer allocator.free(xml);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(allocator, xml, session.original_header.?.source);
}
const Harness = struct {
    allocator: std.mem.Allocator,
    session: *editor.Session,
    history: hist.History,
    lifetime: State,
    fn init(allocator: std.mem.Allocator, bytes: []const u8) !Harness {
        const s = try allocator.create(editor.Session);
        errdefer allocator.destroy(s);
        s.* = try editor.open(allocator, bytes, .{});
        errdefer s.deinit();
        s.history_delta_managed = true;
        var lifetime: State = .{};
        try lifetime.open();
        return .{ .allocator = allocator, .session = s, .history = try hist.History.initV2(s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 }), .lifetime = lifetime };
    }
    fn deinit(self: *Harness) void {
        self.history.deinit();
        self.session.deinit();
        self.allocator.destroy(self.session);
    }
    fn service(self: *Harness) tx.Service {
        return .{ .session = self.session, .history = &self.history, .lifetime = &self.lifetime };
    }
    fn query(self: *Harness, selected: []const f.Owner) !tx.Snapshot {
        const id = try self.lifetime.session(self.allocator);
        defer self.allocator.free(id);
        return self.service().query(self.allocator, .{ .session = id, .revision = self.history.revision() }, selected);
    }
    fn text(self: *Harness, section: usize, paragraph: usize, expected: []const u8) !void {
        const got = try self.session.anchorText(section, paragraph);
        defer self.allocator.free(got);
        try std.testing.expectEqualStrings(expected, got);
    }
};
const owners = [_]f.Owner{ .{ .section = 0, .paragraph = 1 }, .{ .section = 0, .paragraph = 2 } };
fn request(q: *const tx.Snapshot, groups: []const m.Group) m.Apply {
    return .{ .binding = q.binding, .scope = .selection, .coverage = null, .groups = groups };
}
fn group(row: tx.Row, edits: []const m.edits.Edit) m.Group {
    return .{ .ref = row.ref, .before_units = row.before_units, .edits = edits };
}
fn savedEqual(s: *editor.Session, expected: []const u8) !void {
    const actual = try s.save();
    defer s.allocator.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
}

test "HX text service r4 typed query order native units readonly coverage and one History undo redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{ owners[1], owners[0] });
    defer q.deinit();
    try std.testing.expectEqualDeep(owners[1], q.rows[0].owner);
    try std.testing.expectEqual(@as(u32, 5), q.rows[0].before_units);
    try std.testing.expectEqual(@as(u32, 5), q.rows[1].before_units);
    try std.testing.expectEqual(@as(u32, 2), q.coverage.paragraphs);
    try std.testing.expectEqual(@as(u32, 0), q.coverage.created_cell_paragraphs);
    try std.testing.expect(h.session.sections[0].structure_values == null);
    try std.testing.expectEqual(@as(u64, 0), h.session.mutation_serial);
    const gs = [_]m.Group{
        group(q.rows[0], &.{.{ .start = 0, .end = 5, .text = "NEXT", .expected = "OTHER" }}),
        group(q.rows[1], &.{ .{ .start = 0, .end = 1, .text = "X", .expected = "A" }, .{ .start = 1, .end = 3, .text = "👾", .expected = "😀" } }),
    };
    try std.testing.expect(try h.service().apply(a, request(&q, &gs)));
    try std.testing.expectEqual(@as(u32, 1), try h.service().currentRevision());
    try h.text(0, 1, "X👾BC");
    try h.text(0, 2, "NEXT");
    const saved = try h.session.save();
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, "keep='opaque'") != null);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqualStrings("X👾BC", text);
    try std.testing.expect(try h.history.undo(h.session));
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.history.redo(h.session));
    try savedEqual(h.session, saved);
}

test "HX text service r4 rejects V1 foreign poison inprogress external serial and stale lifetimes" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var other = try Harness.init(a, bytes);
    defer other.deinit();
    var service = h.service();
    service.session = other.session;
    try std.testing.expectError(error.SourceBindingMismatch, service.currentRevision());
    var legacy = try hist.History.init(h.session, 4, 8_000_000);
    defer legacy.deinit();
    service = h.service();
    service.history = &legacy;
    try std.testing.expectError(error.HistoryProtocolRequired, service.currentRevision());
    h.history.owned.?.poisoned = true;
    try std.testing.expectError(error.HistoryMutationUncertain, h.service().currentRevision());
    h.history.owned.?.poisoned = false;
    h.session.history_transaction_active = true;
    try std.testing.expectError(error.MutationInProgress, h.service().currentRevision());
    h.session.history_transaction_active = false;
    h.session.history_delta_managed = false;
    try std.testing.expectError(error.HistoryProtocolRequired, h.service().currentRevision());
    h.session.history_delta_managed = true;
    var q = try h.query(&owners);
    defer q.deinit();
    try h.lifetime.open();
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, request(&q, &.{})));
    const id = try h.lifetime.session(a);
    defer a.free(id);
    const stale = [_]m.Group{group(q.rows[0], &.{})};
    var req = request(&q, &stale);
    req.binding.session = id;
    try std.testing.expectError(error.StaleTextTransactionReference, h.service().apply(a, req));
    h.session.mutation_serial += 1;
    try std.testing.expectError(error.HistoryCurrentMismatch, h.service().currentRevision());
    h.session.mutation_serial -= 1;
    h.lifetime.close();
    try std.testing.expectError(error.EditorNotOpen, h.service().currentRevision());
    try savedEqual(h.session, bytes);
}

test "HX text service r4 all admission and late source failure precede mutation preserve redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
    try std.testing.expect(try h.history.undo(h.session));
    var q = try h.query(&owners);
    defer q.deinit();
    const serial = h.session.mutation_serial;
    const stats = h.history.stats();
    var gs = [_]m.Group{
        group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "X", .expected = "A" }}),
        group(q.rows[1], &.{.{ .start = 0, .end = 1, .text = "Y", .expected = "Z" }}),
    };
    try std.testing.expectError(error.ExpectedTextMismatch, h.service().apply(a, request(&q, &gs)));
    gs[1] = group(q.rows[1], &.{.{ .start = 0, .end = 1, .text = "Y" }});
    try std.testing.expectError(error.MissingExpectedText, h.service().apply(a, request(&q, &gs)));
    gs[1] = group(q.rows[1], &.{.{ .start = 0, .end = 1, .text = "\n", .expected = "O" }});
    try std.testing.expectError(error.UnsupportedTextInsertionNewline, h.service().apply(a, request(&q, &gs)));
    gs[1] = group(q.rows[1], &.{.{ .start = 0, .end = 1, .text = "Y", .expected = "O" }});
    gs[1].before_units += 1;
    try std.testing.expectError(error.TextTransactionBeforeMismatch, h.service().apply(a, request(&q, &gs)));
    gs[1] = group(q.rows[0], &.{});
    try std.testing.expectError(error.DuplicateTextTransactionTarget, h.service().apply(a, request(&q, &gs)));
    const split = [_]m.Group{group(q.rows[0], &.{.{ .start = 1, .end = 2, .text = "X", .expected = "Z" }})};
    try std.testing.expectError(error.SplitSurrogatePair, h.service().apply(a, request(&q, &split)));
    try std.testing.expectEqual(serial, h.session.mutation_serial);
    try std.testing.expectEqualDeep(stats, h.history.stats());
    try std.testing.expect(h.session.sections[0].structure_values == null);
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.history.redo(h.session));
    try h.text(0, 2, "!OTHER");
}

test "HX text service r4 noops coverage scope duplicate selectors unsupported kinds and sparse rich insertion" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&owners);
    defer q.deinit();
    var gs = [_]m.Group{group(q.rows[0], &.{.{ .start = 0, .end = 5, .text = "A😀BC", .expected = "A😀BC" }})};
    try std.testing.expect(!try h.service().apply(a, request(&q, &gs)));
    try std.testing.expectEqual(@as(u32, 0), h.history.revision());
    try std.testing.expect(h.session.sections[0].structure_values == null);
    try std.testing.expectError(error.DuplicateTextTransactionTarget, h.query(&.{ owners[0], owners[0] }));
    try std.testing.expectError(error.InvalidParagraphIndex, h.query(&.{.{ .section = 0, .paragraph = 0 }}));
    var req = request(&q, &gs);
    req.scope = .@"complete-current-paragraph-snapshot";
    req.coverage = q.coverage;
    try std.testing.expect(!try h.service().apply(a, req));
    var wrong = q.coverage;
    wrong.paragraphs -= 1;
    req.coverage = wrong;
    try std.testing.expectError(error.IncompleteTextTransactionCoverage, h.service().apply(a, req));
    const forged = try refs.reference(h.lifetime, a, 0, .{ .owner = owners[0], .kind = .anchored });
    defer a.free(forged);
    gs[0].ref = forged;
    try std.testing.expectError(error.UnsupportedTextTransactionTarget, h.service().apply(a, request(&q, &gs)));
    gs[0].ref = q.rows[0].ref;
    gs[0].insertion.character.bold = true;
    try std.testing.expect(try h.service().apply(a, request(&q, &gs)));
    try std.testing.expect(try h.history.undo(h.session));
    try savedEqual(h.session, bytes);
}

fn twoSectionInput() ![]u8 {
    const fixture = @import("test_package_fixture.zig");
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var s = try editor.open(a, seed, .{});
    defer s.deinit();
    const header = try std.mem.replaceOwned(u8, a, s.original_header.?.source, "secCnt=\"1\"", "secCnt=\"2\"");
    defer a.free(header);
    const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", plain, "</s:sec>" });
    defer a.free(xml);
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s0' href='Contents/section0.xml' media-type='application/xml'/><o:item id='s1' href='Contents/section1.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s0'/><o:itemref idref='s1'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = xml },
        .{ .name = "Contents/section1.xml", .data = xml },
    });
}

test "HX text service r4 multi section global one based ordinals exact coverage and transaction" {
    const bytes = try twoSectionInput();
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expectEqual(@as(usize, 3), h.session.sections[1].first_paragraph);
    var q = try h.query(&.{ .{ .section = 1, .paragraph = 3 }, owners[1] });
    defer q.deinit();
    try std.testing.expectEqual(@as(u32, 4), q.coverage.paragraphs);
    try std.testing.expectEqualDeep(m.SectionCoverage{ .section = 1, .paragraphs = 2 }, q.coverage.sections[1]);
    try std.testing.expectError(error.InvalidParagraphIndex, h.query(&.{.{ .section = 1, .paragraph = 1 }}));
    const gs = [_]m.Group{
        group(q.rows[0], &.{.{ .start = 1, .end = 3, .text = "한", .expected = "😀" }}),
        group(q.rows[1], &.{.{ .start = 0, .end = 5, .text = "TAIL", .expected = "OTHER" }}),
    };
    var req = request(&q, &gs);
    req.scope = .@"complete-current-paragraph-snapshot";
    req.coverage = q.coverage;
    try std.testing.expect(try h.service().apply(a, req));
    try h.text(1, 3, "A한BC");
    try h.text(0, 2, "TAIL");
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    try std.testing.expect(try h.history.undo(h.session));
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.history.redo(h.session));
    try h.text(1, 3, "A한BC");
}

test "HX text service r4 actual pending cell store coverage subset and omitted store rejected" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var ids = try @import("created_table_source_ids.zig").plan(h.session, 2);
    defer ids.deinit(a);
    var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(1, 2, 18000, 1800, 2), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "CELL😀", 100);
    try std.testing.expect(try h.history.apply(h.session, .{ .kind = .created_table_stage, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .created_table = &table }));
    var q = try h.query(&.{});
    defer q.deinit();
    try std.testing.expectEqual(@as(usize, 0), q.rows.len);
    try std.testing.expectEqual(@as(u32, 4), q.coverage.paragraphs);
    try std.testing.expectEqual(@as(u32, 4), q.coverage.sections[0].paragraphs);
    try std.testing.expectEqual(@as(u32, 2), q.coverage.created_cell_paragraphs);
    try std.testing.expectEqual(@as(usize, 2), h.session.sections[0].created_tables.entries.items[0].table.cells.len);
    const omitted_rows = [_]m.SectionCoverage{.{ .section = 0, .paragraphs = 2 }};
    var req = request(&q, &.{});
    req.scope = .@"complete-current-paragraph-snapshot";
    req.coverage = .{ .sections = &omitted_rows, .paragraphs = 2, .created_cell_paragraphs = 0 };
    try std.testing.expectError(error.IncompleteTextTransactionCoverage, h.service().apply(a, req));
    req.coverage = q.coverage;
    try std.testing.expect(!try h.service().apply(a, req));
    try std.testing.expectError(error.UnsupportedIndependentCreatedTableMetadata, h.query(&owners));
}

test "HX text service r4 same session generated joined current and stale revision refs" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var old = try h.query(&owners);
    defer old.deinit();
    try std.testing.expect(try h.history.apply(h.session, .{ .kind = .split, .paragraph = 1, .start = 3, .deleted = 0, .inserted = "" }));
    try std.testing.expect(h.session.sections[0].structure_values.?.paragraphs[1].source_ordinal == null);
    var generated = try h.query(&.{.{ .section = 0, .paragraph = 2 }});
    defer generated.deinit();
    try std.testing.expectEqual(@as(u32, 2), generated.rows[0].before_units);
    const oldgroup = [_]m.Group{group(old.rows[0], &.{})};
    var req = request(&old, &oldgroup);
    req.binding = generated.binding;
    try std.testing.expectError(error.StaleTextTransactionReference, h.service().apply(a, req));
    const gs = [_]m.Group{group(generated.rows[0], &.{.{ .start = 0, .end = 2, .text = "NEW", .expected = "BC" }})};
    try std.testing.expect(try h.service().apply(a, request(&generated, &gs)));
    try h.text(0, 2, "NEW");
    try std.testing.expect(try h.history.apply(h.session, .{ .kind = .merge, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expect(h.session.sections[0].structure_values.?.paragraphs[1].pieces != null);
    var joined = try h.query(&.{.{ .section = 0, .paragraph = 2 }});
    defer joined.deinit();
    try std.testing.expectEqual(@as(u32, 8), joined.rows[0].before_units);
    const jgs = [_]m.Group{group(joined.rows[0], &.{ .{ .start = 0, .end = 3, .text = "X", .expected = "NEW" }, .{ .start = 3, .end = 8, .text = "Y", .expected = "OTHER" } })};
    try std.testing.expect(try h.service().apply(a, request(&joined, &jgs)));
    try h.text(0, 2, "XY");
    try std.testing.expect(try h.history.undo(h.session));
    try h.text(0, 2, "NEWOTHER");
    try std.testing.expect(try h.history.redo(h.session));
    try h.text(0, 2, "XY");
}

test "HX text service r4 original nested cell allowed and field permission late preflight readonly" {
    const bytes = try input(a, "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>HOST</p:t><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>CELL😀</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p><p:p id='3' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:ctrl><p:fieldBegin id='7' type='HYPERLINK'/></p:ctrl><p:t>FIELD</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:run></p:p>");
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expectError(error.UnsupportedIndependentFieldMetadata, h.query(&.{.{ .section = 0, .paragraph = 3 }}));
    var q = try h.query(&.{owners[1]});
    defer q.deinit();
    const badref = try refs.reference(h.lifetime, a, 0, .{ .owner = .{ .section = 0, .paragraph = 3 } });
    defer a.free(badref);
    const badgs = [_]m.Group{ group(q.rows[0], &.{.{ .start = 0, .end = 4, .text = "NEST", .expected = "CELL" }}), .{ .ref = badref, .before_units = 5, .edits = &.{} } };
    try std.testing.expectError(error.UnsupportedIndependentFieldMetadata, h.service().apply(a, request(&q, &badgs)));
    try std.testing.expect(h.session.sections[0].structure_values == null);
    try std.testing.expectEqual(@as(u32, 0), h.history.revision());
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.service().apply(a, request(&q, badgs[0..1])));
    try h.text(0, 2, "NEST😀");
    try std.testing.expect(try h.history.undo(h.session));
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.history.redo(h.session));
    try h.text(0, 2, "NEST😀");
}

test "HX text service r4 preflight request budget candidates never install and current identity rejects" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    h.session.options.max_text_bytes = 12;
    var q = try h.query(&owners);
    defer q.deinit();
    const gs = [_]m.Group{
        group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "AAA", .expected = "A" }}),
        group(q.rows[1], &.{.{ .start = 0, .end = 1, .text = "OOO", .expected = "O" }}),
    };
    try std.testing.expectError(error.LimitExceeded, h.service().apply(a, request(&q, &gs)));
    try std.testing.expectEqual(@as(u32, 0), h.history.revision());
    try std.testing.expect(h.session.sections[0].structure_values == null);
    var context = try @import("independent_text_session.zig").Context.init(h.session);
    defer context.deinit();
    try std.testing.expectEqual(@as(u32, 5), try context.inspect(0, 1));
    try std.testing.expectEqual(@as(u32, 5), try context.inspect(0, 2));
    try context.preflight(0, 1, 5, &.{.{ .start = 0, .end = 1, .text = "X", .expected = "A" }});
    try context.validatePrepared();
    try std.testing.expectEqual(@as(usize, 1), context.work.section_builds);
    try std.testing.expect(h.session.sections[0].structure_values == null);
    try h.text(0, 1, "A😀BC");
    try std.testing.expect(try h.history.apply(h.session, .{ .kind = .split, .paragraph = 1, .start = 3, .deleted = 0, .inserted = "" }));
    const p = &h.session.sections[0].structure_values.?.paragraphs[1];
    const valid = p.generated_id;
    p.generated_id = 0;
    try std.testing.expectError(error.InvalidCurrentParagraphReference, h.query(&.{.{ .section = 0, .paragraph = 2 }}));
    p.generated_id = valid;
}

test "HX text service r4 sampled query OOM owns outputs and never changes live state" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var measured: usize = 0;
    for (0..9) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var h = try Harness.init(fa, bytes);
        defer h.deinit();
        const before = failing.alloc_index;
        if (sample != 0) failing.fail_index = before + (sample - 1) * (measured - 1) / 7;
        var q = h.query(&owners) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expect(h.session.sections[0].structure_values == null);
            try std.testing.expectEqual(@as(u64, 0), h.session.mutation_serial);
            try std.testing.expectEqual(@as(u32, 0), h.history.revision());
            try savedEqual(h.session, bytes);
            continue;
        };
        defer q.deinit();
        try std.testing.expectEqual(@as(usize, 0), sample);
        measured = failing.alloc_index - before;
        try std.testing.expect(measured > 8);
    }
    std.debug.print("SERVICE_QUERY_OOM measured={d} sampled=8 restored=8\n", .{measured});
}

test "HX text service r4 sampled actual Service History OOM preserves original and redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var measured: usize = 0;
    var restored: usize = 0;
    for (0..9) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var h = try Harness.init(fa, bytes);
        defer h.deinit();
        try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
        try std.testing.expect(try h.history.undo(h.session));
        var q = try h.query(&owners);
        defer q.deinit();
        const gs = [_]m.Group{
            group(q.rows[0], &.{ .{ .start = 0, .end = 1, .text = "X", .expected = "A" }, .{ .start = 1, .end = 3, .text = "👾", .expected = "😀" } }),
            group(q.rows[1], &.{.{ .start = 0, .end = 5, .text = "NEXT", .expected = "OTHER" }}),
        };
        const revision = h.history.revision();
        const count = h.history.revisionCount();
        const before = failing.alloc_index;
        if (sample != 0) failing.fail_index = before + (sample - 1) * (measured - 1) / 7;
        const changed = h.service().apply(fa, request(&q, &gs)) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expect(!h.history.stats().poisoned);
            try std.testing.expectEqual(revision, h.history.revision());
            try std.testing.expectEqual(count, h.history.revisionCount());
            try savedEqual(h.session, bytes);
            try std.testing.expect(try h.history.redo(h.session));
            try h.text(0, 2, "!OTHER");
            restored += 1;
            continue;
        };
        try std.testing.expectEqual(@as(usize, 0), sample);
        try std.testing.expect(changed);
        measured = failing.alloc_index - before;
        try std.testing.expect(measured > 8);
    }
    try std.testing.expectEqual(@as(usize, 8), restored);
    std.debug.print("SERVICE_APPLY_OOM measured={d} sampled=8 restored_redo={d}\n", .{ measured, restored });
}

test "HX text service r4 retained inline Native unit axis protected deletion and rebind" {
    const bytes = try input(a, "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>A<p:tab/>B</p:t><p:pic/><p:t>C😀D</p:t></p:run></p:p>");
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    try std.testing.expectEqual(@as(u32, 8), q.rows[0].before_units);
    const bad = [_]m.Group{group(q.rows[0], &.{.{ .start = 1, .end = 2, .text = "", .expected = "\t" }})};
    try std.testing.expectError(error.ProtectedInlineControl, h.service().apply(a, request(&q, &bad)));
    const control = [_]m.Group{group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "\x01", .expected = "A" }})};
    try std.testing.expectError(error.InvalidXmlCharacter, h.service().apply(a, request(&q, &control)));
    try std.testing.expect(h.session.sections[0].structure_values == null);
    const gs = [_]m.Group{group(q.rows[0], &.{ .{ .start = 0, .end = 1, .text = "AA", .expected = "A" }, .{ .start = 5, .end = 7, .text = "👾", .expected = "😀" } })};
    try std.testing.expect(try h.service().apply(a, request(&q, &gs)));
    try h.text(0, 1, "AA\tB\xef\xbf\xbcC👾D");
    try std.testing.expectError(error.StaleFormattingBinding, h.service().query(a, q.binding, &.{owners[0]}));
    var rebound = try h.query(&.{owners[0]});
    defer rebound.deinit();
    try std.testing.expectEqual(@as(u32, 9), rebound.rows[0].before_units);
    try std.testing.expect(try h.history.undo(h.session));
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.history.redo(h.session));
    try std.testing.expect(try h.session.spliceAnchored(0, 1, 0, 1, "Z"));
    try std.testing.expectError(error.HistoryCurrentMismatch, h.service().currentRevision());
}

test "HX text service r4 note drawing caption header nested owners use same Native policy" {
    const pairs = [_][2][]const u8{
        .{ "<p:ctrl><p:footNote><p:subList>", "</p:subList></p:footNote></p:ctrl>" },
        .{ "<p:rect><p:drawText><p:subList>", "</p:subList></p:drawText></p:rect>" },
        .{ "<p:tbl rowCnt='1' colCnt='1'><p:caption><p:subList>", "</p:subList></p:caption></p:tbl>" },
        .{ "<p:secPr><p:header><p:subList>", "</p:subList></p:header></p:secPr>" },
    };
    for (pairs) |pair| {
        const xml = try std.mem.concat(a, u8, &.{ "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>HOST</p:t>", pair[0], "<p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>NEST😀</p:t></p:run></p:p>", pair[1], "</p:run></p:p>" });
        defer a.free(xml);
        const bytes = try input(a, xml);
        defer a.free(bytes);
        var h = try Harness.init(a, bytes);
        defer h.deinit();
        var q = try h.query(&.{owners[1]});
        defer q.deinit();
        try std.testing.expectEqual(@as(u32, 6), q.rows[0].before_units);
        const gs = [_]m.Group{group(q.rows[0], &.{ .{ .start = 0, .end = 4, .text = "NEXT", .expected = "NEST" }, .{ .start = 4, .end = 6, .text = "👾", .expected = "😀" } })};
        try std.testing.expect(try h.service().apply(a, request(&q, &gs)));
        try h.text(0, 2, "NEXT👾");
        try std.testing.expect(try h.history.undo(h.session));
        try savedEqual(h.session, bytes);
    }
}
