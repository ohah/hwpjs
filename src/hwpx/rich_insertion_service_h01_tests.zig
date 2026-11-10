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
    const Mode = enum { original, generated, joined };
    fn init(allocator: std.mem.Allocator, bytes: []const u8) !Harness {
        return initMode(allocator, bytes, .original);
    }
    fn initMode(allocator: std.mem.Allocator, bytes: []const u8, mode: Mode) !Harness {
        const s = try allocator.create(editor.Session);
        errdefer allocator.destroy(s);
        s.* = try editor.open(allocator, bytes, .{});
        errdefer s.deinit();
        switch (mode) {
            .original => {},
            .generated => _ = try s.splitParagraph(0, 1, 0, 0),
            .joined => _ = try s.mergeParagraph(0, 1),
        }
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

test "HX H01 rich insertion actual service longer after one revision" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "한😀LONGINPUT", .expected = "A" }});
    g.insertion = .{ .character = .{ .bold = true, .text_color = 0x123456 } };
    try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    try h.text(0, 1, "한😀LONGINPUT😀BC");
}

const names = [_][]const u8{ "H01 Hangul", "H01 Latin", "H01 Hanja", "H01 Japanese", "H01 Other", "H01 Symbol", "H01 User" };
const langs = @import("../model/character_fonts.zig").languages;
fn richPatch() f.Patch {
    var p: f.Patch = .{ .character = .{ .bold = true, .italic = false, .size = 1900, .text_color = 0x123456, .underline_kind = .bottom, .underline_color = 0x224466, .underline_style = .DASH, .strike_enabled = true, .strike_style = .SOLID, .strike_color = 0x654321 } };
    for (names, 0..) |name, i| p.fonts[i] = .{ .name = name };
    return p;
}
fn inspect(session: *editor.Session, paragraph: usize, start: usize, full: bool) !void {
    var arena = std.heap.ArenaAllocator.init(session.allocator);
    defer arena.deinit();
    const aa = arena.allocator();
    const B = @import("formatting_projection.zig").Backend;
    var snapshot: B.Snapshot = .{ .allocator = session.allocator };
    defer snapshot.deinit();
    const backend: B = .{ .session = session, .allocator = aa, .snapshot = &snapshot };
    const spans = try backend.spans(aa, .{ .section = 0, .paragraph = paragraph });
    const id = for (spans) |span| {
        if (span.start <= start and start < span.end) break span.resource orelse return error.MissingInsertedResource;
    } else return error.MissingInsertedSpan;
    const color = try backend.characterField(aa, id, "character.textColor");
    try std.testing.expectEqual(@as(i64, 0x123456), color.value.?.integer);
    if (!full) return;
    const under = try backend.characterField(aa, id, "character.underline.kind");
    try std.testing.expectEqualStrings("bottom", under.value.?.string);
    const strike = try backend.characterField(aa, id, "character.strike.enabled");
    try std.testing.expect(strike.value.?.bool);
    const fonts = try backend.characterField(aa, id, "character.fontNames");
    for (langs, names) |language, name| try std.testing.expectEqualStrings(name, fonts.value.?.object.get(@tagName(language)).?.string);
    const bold = try backend.characterField(aa, id, "character.bold");
    try std.testing.expect(bold.value.?.bool);
    const italic = try backend.characterField(aa, id, "character.italic");
    try std.testing.expect(!italic.value.?.bool);
}
fn exactRoundtrip(h: *Harness, before: []const u8, paragraph: usize, start: usize, full: bool) !void {
    const after = try h.session.save();
    defer h.allocator.free(after);
    var reopened = try editor.open(h.allocator, after, .{});
    defer reopened.deinit();
    try inspect(&reopened, paragraph, start, full);
    try std.testing.expect(try h.history.undo(h.session));
    try savedEqual(h.session, before);
    try std.testing.expect(try h.history.redo(h.session));
    try savedEqual(h.session, after);
    try inspect(h.session, paragraph, start, full);
}

test "HX H01 full sparse character and seven fonts longer than before exact save undo redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "한😀LONGINPUT", .expected = "A" }});
    g.insertion = richPatch();
    try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    try inspect(h.session, 1, 0, true);
    try exactRoundtrip(&h, bytes, 1, 0, true);
    const after = try h.session.save();
    defer a.free(after);
    try archiveEvidence("before", bytes);
    try archiveEvidence("after", after);
    try std.testing.expect(std.mem.indexOf(u8, after, "keep='opaque'") != null);
}

test "HX H01 generated empty caret after-view no save reopen before apply" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var h = try Harness.initMode(a, seed, .generated);
    defer h.deinit();
    var q = try h.query(&.{.{ .section = 0, .paragraph = 2 }});
    defer q.deinit();
    try std.testing.expectEqual(@as(u32, 0), q.rows[0].before_units);
    var g = group(q.rows[0], &.{.{ .start = 0, .end = 0, .text = "😀한LONG", .expected = "" }});
    g.insertion = richPatch();
    try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
    try inspect(h.session, 2, 0, true);
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expect(try h.history.undo(h.session));
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expect(try h.history.redo(h.session));
    try savedEqual(h.session, after);
    try exactRoundtrip(&h, before, 2, 0, true);
}

test "HX H01 joined cross-piece replacement full intent original coordinates" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.initMode(a, bytes, .joined);
    defer h.deinit();
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    try std.testing.expectEqual(@as(u32, 10), q.rows[0].before_units);
    var g = group(q.rows[0], &.{.{ .start = 4, .end = 7, .text = "한😀LONGINPUT", .expected = "COT" }});
    g.insertion = richPatch();
    try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
    try h.text(0, 1, "A😀B한😀LONGINPUTHER");
    try inspect(h.session, 1, 4, true);
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expect(try h.history.undo(h.session));
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expect(try h.history.redo(h.session));
    try savedEqual(h.session, after);
    try exactRoundtrip(&h, before, 1, 4, true);
}

test "HX H01 same text intent changes style then repeated request noop retains redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 1, .end = 3, .text = "😀", .expected = "😀" }});
    g.insertion = .{ .character = .{ .text_color = 0x123456 } };
    try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
    try h.text(0, 1, "A😀BC");
    try inspect(h.session, 1, 1, false);
    var q2 = try h.query(&.{owners[0]});
    defer q2.deinit();
    g.ref = q2.rows[0].ref;
    const stats = h.history.stats();
    try std.testing.expect(!try h.service().apply(a, request(&q2, &.{g})));
    try std.testing.expectEqualDeep(stats, h.history.stats());
    try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
    try std.testing.expect(try h.history.undo(h.session));
    var q3 = try h.query(&.{owners[0]});
    defer q3.deinit();
    g.ref = q3.rows[0].ref;
    const undoStats = h.history.stats();
    try std.testing.expect(!try h.service().apply(a, request(&q3, &.{g})));
    try std.testing.expectEqualDeep(undoStats, h.history.stats());
    try std.testing.expect(try h.history.redo(h.session));
    try h.text(0, 2, "!OTHER");
}

test "HX H01 multiple groups adjacent ranges deletion and emoji shifted after extents" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&owners);
    defer q.deinit();
    var gs = [_]m.Group{
        group(q.rows[0], &.{ .{ .start = 0, .end = 1, .text = "XYZ", .expected = "A" }, .{ .start = 1, .end = 3, .text = "😀", .expected = "😀" }, .{ .start = 3, .end = 4, .text = "", .expected = "B" }, .{ .start = 4, .end = 5, .text = "한글", .expected = "C" } }),
        group(q.rows[1], &.{.{ .start = 0, .end = 5, .text = "END", .expected = "OTHER" }}),
    };
    for (&gs) |*g| g.insertion = richPatch();
    try std.testing.expect(try h.service().apply(a, request(&q, &gs)));
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    try h.text(0, 1, "XYZ😀한글");
    try h.text(0, 2, "END");
    for ([_]usize{ 0, 3, 5, 6 }) |at| try inspect(h.session, 1, at, true);
    try inspect(h.session, 2, 0, true);
    try exactRoundtrip(&h, bytes, 1, 5, true);
}

test "HX H01 late bad expected font name surrogate newline empty style reject preserve redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
    try std.testing.expect(try h.history.undo(h.session));
    var q = try h.query(&owners);
    defer q.deinit();
    const stats = h.history.stats();
    const serial = h.session.mutation_serial;
    var gs = [_]m.Group{ group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "LONG", .expected = "A" }}), group(q.rows[1], &.{.{ .start = 0, .end = 1, .text = "X", .expected = "Z" }}) };
    gs[0].insertion = richPatch();
    gs[1].insertion = richPatch();
    try std.testing.expectError(error.ExpectedTextMismatch, h.service().apply(a, request(&q, &gs)));
    gs[1].edits = &.{.{ .start = 0, .end = 1, .text = "X", .expected = "O" }};
    gs[1].insertion.fonts[6] = .{ .name = "" };
    try std.testing.expectError(error.InvalidFontName, h.service().apply(a, request(&q, &gs)));
    gs[1].insertion = richPatch();
    gs[0].edits = &.{.{ .start = 1, .end = 2, .text = "X", .expected = "x" }};
    try std.testing.expectError(error.SplitSurrogatePair, h.service().apply(a, request(&q, &gs)));
    gs[0].edits = &.{.{ .start = 0, .end = 1, .text = "\n", .expected = "A" }};
    try std.testing.expectError(error.UnsupportedTextInsertionNewline, h.service().apply(a, request(&q, &gs)));
    gs[0].edits = &.{.{ .start = 0, .end = 1, .text = "", .expected = "A" }};
    try std.testing.expectError(error.EmptyStyledTextInsertion, h.service().apply(a, request(&q, &gs)));
    try savedEqual(h.session, bytes);
    try std.testing.expectEqual(serial, h.session.mutation_serial);
    try std.testing.expectEqualDeep(stats, h.history.stats());
    try std.testing.expect(try h.history.redo(h.session));
    try h.text(0, 2, "!OTHER");
}

fn archiveEvidence(label: []const u8, bytes: []const u8) !void {
    const buf = try a.alloc(u8, std.base64.standard.Encoder.calcSize(bytes.len));
    defer a.free(buf);
    std.debug.print("H01_ARCHIVE {s} {s}\n", .{ label, std.base64.standard.Encoder.encode(buf, bytes) });
}

test "HX H01 source style boundary sparse intent preserves unrequested first style and zero left" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expect(try s.setCharacterProperties(0, 1, 3, 5, .{ .italic = true, .size = 2300, .bold = true }));
    const styled = try s.save();
    defer a.free(styled);
    for ([_]bool{ false, true }) |caret| {
        var h = try Harness.init(a, styled);
        defer h.deinit();
        var q = try h.query(&.{owners[0]});
        defer q.deinit();
        var g = group(q.rows[0], &.{.{ .start = 3, .end = if (caret) 3 else 4, .text = "LONG😀", .expected = if (caret) "" else "B" }});
        g.insertion = .{ .character = .{ .text_color = 0x123456, .bold = false } };
        try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
        const spans = try @import("character_style_snapshot.zig").read(h.session, 0, 1);
        defer a.free(spans);
        const id = for (spans) |span| {
            if (span.start_unit <= 3 and 3 < span.end_unit) break span.char_shape_id.?;
        } else return error.MissingInsertedSpan;
        var arena = std.heap.ArenaAllocator.init(a);
        defer arena.deinit();
        const aa = arena.allocator();
        const B = @import("formatting_projection.zig").Backend;
        const b: B = .{ .session = h.session, .allocator = aa };
        const italic = try b.characterField(aa, id, "character.italic");
        try std.testing.expectEqual(!caret, italic.value.?.bool);
        try exactRoundtrip(&h, styled, 1, 3, false);
    }
}

test "HX H01 missing strike color source field preflight preserves bytes and redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
    try std.testing.expect(try h.history.undo(h.session));
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "LONG", .expected = "A" }});
    g.insertion = .{ .character = .{ .strike_color = 0x123456 } };
    const stats = h.history.stats();
    try std.testing.expectError(error.MissingCharacterStrikeColorField, h.service().apply(a, request(&q, &.{g})));
    try savedEqual(h.session, bytes);
    try std.testing.expectEqualDeep(stats, h.history.stats());
    try std.testing.expect(try h.history.redo(h.session));
}

test "HX H01 source nested paragraph accepted and generated nested formatter guard preserved" {
    const nested = "<p:p paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>HOST</p:t><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:subList><p:p paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>CELL</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p>";
    const bytes = try input(a, nested);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owners[1]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 0, .end = 4, .text = "NEST😀LONG", .expected = "CELL" }});
    g.insertion = richPatch();
    try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
    try inspect(h.session, 2, 0, true);
    try exactRoundtrip(&h, bytes, 2, 0, true);
    try std.testing.expect(try h.history.apply(h.session, .{ .kind = .split, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    var q2 = try h.query(&.{.{ .section = 0, .paragraph = 3 }});
    defer q2.deinit();
    var bad = group(q2.rows[0], &.{.{ .start = 0, .end = 0, .text = "NEW", .expected = "" }});
    bad.insertion = richPatch();
    const before = try h.session.save();
    defer a.free(before);
    const stats = h.history.stats();
    try std.testing.expectError(error.UnsupportedFormattingOwner, h.service().apply(a, request(&q2, &.{bad})));
    try savedEqual(h.session, before);
    try std.testing.expectEqualDeep(stats, h.history.stats());
}

test "HX H01 field metadata reject before rich mutation" {
    const field = "<p:p paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:ctrl><p:fieldBegin id='3' type='UNKNOWN'/></p:ctrl><p:t>FIELD</p:t><p:ctrl><p:fieldEnd beginIDRef='3'/></p:ctrl></p:run></p:p>";
    const bytes = try input(a, field);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{});
    defer q.deinit();
    const ref = try refs.reference(h.lifetime, a, h.history.revision(), .{ .owner = owners[0], .kind = .plain });
    defer a.free(ref);
    const gs = [_]m.Group{.{ .ref = ref, .before_units = 5, .edits = &.{.{ .start = 0, .end = 1, .text = "LONG", .expected = "F" }}, .insertion = richPatch() }};
    try std.testing.expectError(error.UnsupportedIndependentFieldMetadata, h.service().apply(a, request(&q, &gs)));
    try savedEqual(h.session, bytes);
}

test "HX H01 bounded sampled actual rich Service OOM restores styles resources bytes redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var measured: usize = 0;
    var failures: usize = 0;
    var rollback_serials: usize = 0;
    for (0..33) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var h = try Harness.init(fa, bytes);
        defer h.deinit();
        try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
        try std.testing.expect(try h.history.undo(h.session));
        var q = try h.query(&.{owners[0]});
        defer q.deinit();
        var g = group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "한😀LONGINPUT", .expected = "A" }});
        g.insertion = richPatch();
        const stats = h.history.stats();
        const serial = h.session.mutation_serial;
        const start = failing.alloc_index;
        if (sample != 0) failing.fail_index = start + (sample - 1) * (measured - 1) / 31;
        const changed = h.service().apply(fa, request(&q, &.{g})) catch |err| blk: {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            failures += 1;
            break :blk false;
        };
        if (sample == 0) measured = failing.alloc_index - start;
        failing.fail_index = std.math.maxInt(usize);
        if (!changed) {
            try std.testing.expectEqualDeep(stats, h.history.stats());
            // Existing History invalidates raw tickets after an actual rollback,
            // even when bytes/styles and the undo/redo stack are exactly restored.
            try std.testing.expect(h.session.mutation_serial == serial or h.session.mutation_serial == serial + 1);
            if (h.session.mutation_serial != serial) rollback_serials += 1;
            try std.testing.expectEqual(stats.revision, try h.service().currentRevision());
            try std.testing.expect(!h.history.stats().poisoned);
            try std.testing.expect(h.session.formatting_batch == null);
            try savedEqual(h.session, bytes);
            try std.testing.expectEqual(@as(usize, 0), h.session.character_resources.entries.items.len);
            try std.testing.expectEqual(@as(usize, 0), h.session.font_resources.entries.items.len);
            try std.testing.expect(try h.history.redo(h.session));
            try h.text(0, 2, "!OTHER");
        } else try inspect(h.session, 1, 0, true);
    }
    try std.testing.expectEqual(@as(usize, 32), failures);
    std.debug.print("H01_RICH_OOM samples=32 opportunities={d} restored={d} rollback_serials={d}\n", .{ measured, failures, rollback_serials });
}

test "HX H01 retained tab anchor same current native axis reject control replacement" {
    const bytes = try input(a, "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0' keep='control-run'><p:t>A<p:tab/>B</p:t><p:pic/><p:t>C😀D</p:t></p:run></p:p>");
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 1, .end = 2, .text = "\t", .expected = "\t" }});
    g.insertion = richPatch();
    try std.testing.expectError(error.ProtectedInlineControl, h.service().apply(a, request(&q, &.{g})));
    try savedEqual(h.session, bytes);
    g.edits = &.{ .{ .start = 0, .end = 1, .text = "AAA", .expected = "A" }, .{ .start = 5, .end = 7, .text = "X", .expected = "😀" } };
    try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
    try h.text(0, 1, "AAA\tB\xef\xbf\xbcCXD");
    try inspect(h.session, 1, 0, true);
    try inspect(h.session, 1, 7, true);
    try exactRoundtrip(&h, bytes, 1, 7, true);
    const saved = try h.session.save();
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, "keep='control-run'") != null);
}

test "HX H01 sparse color-only creation and font-only insertion use actual writer policy" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    for ([_]bool{ false, true }) |font_only| {
        var h = try Harness.init(a, bytes);
        defer h.deinit();
        var q = try h.query(&.{owners[0]});
        defer q.deinit();
        var g = group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "LONG", .expected = "A" }});
        if (font_only) {
            for (names, 0..) |name, i| g.insertion.fonts[i] = .{ .name = name };
        } else g.insertion.character.underline_color = 0x234567;
        try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
        try std.testing.expectEqual(@as(u32, 1), h.history.revision());
        const after = try h.session.save();
        defer a.free(after);
        try std.testing.expect(try h.history.undo(h.session));
        try savedEqual(h.session, bytes);
        try std.testing.expect(try h.history.redo(h.session));
        try savedEqual(h.session, after);
        if (!font_only) {
            try std.testing.expect(std.mem.indexOf(u8, after, "#234567") != null);
        }
    }
}

test "HX H01 invalid IDs reset paragraph rich and stale fail before live transfer" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "LONG", .expected = "A" }});
    g.insertion.fonts[0] = .{ .id = 99999 };
    try std.testing.expectError(error.InvalidFontId, h.service().apply(a, request(&q, &.{g})));
    g.insertion = .{ .reset = .character };
    try std.testing.expectError(error.UnsupportedTextInsertionFormatting, h.service().apply(a, request(&q, &.{g})));
    g.insertion = .{ .paragraph = .{ .alignment = .CENTER } };
    try std.testing.expectError(error.UnsupportedTextInsertionFormatting, h.service().apply(a, request(&q, &.{g})));
    try savedEqual(h.session, bytes);
    try std.testing.expectEqual(@as(u32, 0), h.history.revision());
    try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
    g.insertion = richPatch();
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, request(&q, &.{g})));
    try h.text(0, 1, "A😀BC");
}

test "HX H01 plain independent first replaced source and generic single legacy remain separate" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expect(try s.setCharacterProperties(0, 1, 3, 5, .{ .italic = true, .size = 2300 }));
    const styled = try s.save();
    defer a.free(styled);
    for ([_]bool{ false, true }) |single| {
        var h = try Harness.init(a, styled);
        defer h.deinit();
        if (single) {
            try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 1, .start = 3, .deleted = 1, .inserted = "LONG" }));
        } else {
            var q = try h.query(&.{owners[0]});
            defer q.deinit();
            const g = group(q.rows[0], &.{.{ .start = 3, .end = 4, .text = "LONG", .expected = "B" }});
            try std.testing.expect(try h.service().apply(a, request(&q, &.{g})));
        }
        var arena = std.heap.ArenaAllocator.init(a);
        defer arena.deinit();
        const aa = arena.allocator();
        const b: @import("formatting_projection.zig").Backend = .{ .session = h.session, .allocator = aa };
        const spans = try b.spans(aa, owners[0]);
        const id = for (spans) |span| {
            if (span.start <= 3 and 3 < span.end) break span.resource.?;
        } else return error.MissingInsertedSpan;
        const italic = try b.characterField(aa, id, "character.italic");
        try std.testing.expectEqual(!single, italic.value.?.bool);
    }
}
