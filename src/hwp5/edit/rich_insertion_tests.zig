//! Constructor-only actual H5 Service/Session/History tests. No wire/ABI activation.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const tx = @import("text_transaction.zig");
const m = @import("../../model/text_transaction.zig");
const fmt = @import("../../model/formatting_patch.zig");
const State = @import("../../model/formatting_binding.zig").State;
const names = [_][]const u8{ "H01 Hangul", "H01 Latin", "H01 Hanja", "H01 Japanese", "H01 Other", "H01 Symbol", "H01 User" };
const languages = @import("../../model/character_fonts.zig").languages;
const H = struct {
    allocator: std.mem.Allocator,
    session: *edit.Session,
    history: History,
    state: State,
    fn init(allocator: std.mem.Allocator) !H {
        return initStyled(allocator, false);
    }
    fn initStyled(allocator: std.mem.Allocator, styled: bool) !H {
        return initMany(allocator, styled, 0);
    }
    fn initMany(allocator: std.mem.Allocator, styled: bool, count: usize) !H {
        const bytes = try @import("../../new_document/root.zig").hwp5(allocator);
        defer allocator.free(bytes);
        const s = try edit.Session.open(allocator, bytes);
        errdefer s.close();
        try s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
        try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "ab😀cd" } });
        try s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 6 } });
        try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "TAIL" } });
        try s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 2, .at_unit = 4 } });
        if (styled) {
            try s.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 4, .properties = .{ .bold = true, .italic = true, .underline_kind = .bottom, .underline_color = 0x224466, .strike_enabled = true, .text_color = 0x123456 } } });
            for (languages, names) |language, name| try s.apply(.{ .set_character_font_name = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 4, .language = language, .name = name } });
        }
        if (count != 0) {
            const fixture = try allocator.alloc(u8, count * 3);
            defer allocator.free(fixture);
            for (0..count) |i| @memcpy(fixture[i * 3 ..][0..3], "a b");
            try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 6, .utf8 = fixture } });
            // Set alternating old runs before opening measured History.
            for (0..count) |i| try s.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = @intCast(i * 3 + 1), .end_unit = @intCast(i * 3 + 2), .properties = .{ .italic = true, .size = 1900 } } });
        }
        s.enableHistoryDelta();
        var state: State = .{};
        try state.open();
        return .{ .allocator = allocator, .session = s, .history = try History.initV2(allocator, s, .{ .max_entries = 16 }), .state = state };
    }
    fn deinit(self: *H) void {
        self.history.deinit();
        self.session.close();
    }
    fn service(self: *H) tx.Service {
        return .{ .session = self.session, .history = &self.history, .lifetime = &self.state };
    }
    fn query(self: *H, owners: []const fmt.Owner) !tx.Snapshot {
        const id = try self.state.session(self.allocator);
        defer self.allocator.free(id);
        return self.service().query(self.allocator, .{ .session = id, .revision = self.history.revision() }, owners);
    }
    fn save(self: *H) ![]u8 {
        return (try self.session.save(a, .{ .allow_stale_layout = true })).bytes;
    }
};
fn intent() fmt.Patch {
    var result: fmt.Patch = .{ .character = .{ .bold = true, .italic = false, .underline_kind = .bottom, .underline_color = 0x224466, .strike_enabled = true, .text_color = 0x123456 } };
    for (names, 0..) |name, i| result.fonts[i] = .{ .name = name };
    return result;
}
fn request(q: *const tx.Snapshot, groups: []const m.Group) m.Apply {
    return .{ .binding = q.binding, .scope = .selection, .coverage = null, .groups = groups };
}
fn text(s: *edit.Session, p: usize, wanted: []const u8) !void {
    const actual = try s.copyText(a, 0, p);
    defer a.free(actual);
    const terminated = try std.mem.concat(a, u8, &.{ wanted, "\r" });
    defer a.free(terminated);
    const expected = try std.unicode.utf8ToUtf16LeAlloc(a, terminated);
    defer a.free(expected);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected), actual);
}
fn resource(s: *edit.Session, p: usize, at: u32) !u32 {
    const rows = try s.characterRanges(a, 0, p);
    defer a.free(rows);
    for (rows) |row| if (row.start_unit <= at and at < row.end_unit) return row.char_shape_id orelse error.MissingStyle;
    return error.MissingRange;
}
fn style(s: *edit.Session, p: usize, at: u32, color: u32, all_names: bool) !void {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const B = @import("formatting_projection.zig").Backend;
    var cache: B.Snapshot = .{ .allocator = scratch };
    defer cache.deinit();
    const b: B = .{ .session = s, .allocator = scratch, .snapshot = &cache };
    const id = try resource(s, p, at);
    const c = try b.characterField(scratch, id, "character.textColor");
    try std.testing.expectEqual(.known, c.state);
    try std.testing.expectEqual(@as(i64, color), c.value.?.integer);
    if (all_names) {
        const f = try b.characterField(scratch, id, "character.fontNames");
        try std.testing.expectEqual(.known, f.state);
        for (languages, names) |language, name| try std.testing.expectEqualStrings(name, f.value.?.object.get(@tagName(language)).?.string);
        const u = try b.characterField(scratch, id, "character.underline.kind");
        try std.testing.expectEqualStrings("bottom", u.value.?.string);
        const strike = try b.characterField(scratch, id, "character.strike.enabled");
        try std.testing.expectEqual(true, strike.value.?.bool);
    }
}
fn unchanged(h: *H, before: []const u8, revision: u32) !void {
    const after = try h.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(revision, h.history.revision());
    try std.testing.expect(!h.history.stats().poisoned);
}
test "H5 H01 rich original and generated empty longer after one History undo redo reopen" {
    for ([_]usize{ 0, 3 }) |p| {
        var h = try H.init(a);
        defer h.deinit();
        var q = try h.query(&.{.{ .section = 0, .paragraph = p }});
        defer q.deinit();
        const before = try h.save();
        defer a.free(before);
        const start = q.rows[0].before_units;
        const edits = [_]m.edits.Edit{.{ .start = start, .end = start, .text = "한😀LONGINPUT", .expected = "" }};
        const groups = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = start, .edits = &edits, .insertion = intent() }};
        try std.testing.expect(try h.service().apply(a, request(&q, &groups)));
        try std.testing.expectEqual(@as(u32, 1), h.history.revision());
        try std.testing.expectEqual(@as(usize, 1), h.history.stats().undoCount);
        try style(h.session, p, start, 0x123456, true);
        const after = try h.save();
        defer a.free(after);
        const reopened = try edit.Session.open(a, after);
        defer reopened.close();
        try style(reopened, p, start, 0x123456, true);
        try std.testing.expect(try h.history.undo(h.session));
        try unchanged(&h, before, 0);
        try std.testing.expect(try h.history.redo(h.session));
        try unchanged(&h, after, 1);
    }
}
test "H5 H01 rich independent edits original axis deletion emoji no-op text and multiple groups" {
    var h = try H.init(a);
    defer h.deinit();
    var q = try h.query(&.{ .{ .section = 0, .paragraph = 1 }, .{ .section = 0, .paragraph = 2 } });
    defer q.deinit();
    const before = try h.save();
    defer a.free(before);
    const first = [_]m.edits.Edit{ .{ .start = 0, .end = 1, .text = "XYZ", .expected = "a" }, .{ .start = 1, .end = 2, .text = "", .expected = "b" }, .{ .start = 2, .end = 4, .text = "😀", .expected = "😀" }, .{ .start = 6, .end = 6, .text = "END", .expected = "" } };
    const second = [_]m.edits.Edit{.{ .start = 0, .end = 4, .text = "ZZ", .expected = "TAIL" }};
    const groups = [_]m.Group{ .{ .ref = q.rows[0].ref, .before_units = 6, .edits = &first, .insertion = intent() }, .{ .ref = q.rows[1].ref, .before_units = 4, .edits = &second, .insertion = .{ .character = .{ .bold = false, .text_color = 0, .font_ids = @splat(0) } } } };
    try std.testing.expect(try h.service().apply(a, request(&q, &groups)));
    try text(h.session, 1, "XYZ😀cdEND");
    try text(h.session, 2, "ZZ");
    try style(h.session, 1, 0, 0x123456, true);
    try style(h.session, 1, 3, 0x123456, true);
    try style(h.session, 1, 7, 0x123456, true);
    try style(h.session, 1, 5, 0, false);
    try style(h.session, 2, 0, 0, false);
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    const after = try h.save();
    defer a.free(after);
    try std.testing.expect(try h.history.undo(h.session));
    try unchanged(&h, before, 0);
    try std.testing.expect(try h.history.redo(h.session));
    try unchanged(&h, after, 1);
}
test "H5 H01 rich identical text is explicit paint and repeated paint is noop preserving redo" {
    var h = try H.init(a);
    defer h.deinit();
    var q = try h.query(&.{.{ .section = 0, .paragraph = 1 }});
    defer q.deinit();
    const edits = [_]m.edits.Edit{.{ .start = 0, .end = 2, .text = "ab", .expected = "ab" }};
    var g = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = 6, .edits = &edits, .insertion = .{ .character = .{ .text_color = 0x123456 } } }};
    try std.testing.expect(try h.service().apply(a, request(&q, &g)));
    try text(h.session, 1, "ab😀cd");
    try style(h.session, 1, 0, 0x123456, false);
    var now = try h.query(&.{.{ .section = 0, .paragraph = 1 }});
    defer now.deinit();
    g[0].ref = now.rows[0].ref;
    const saved = try h.save();
    defer a.free(saved);
    try std.testing.expect(!try h.service().apply(a, request(&now, &g)));
    try unchanged(&h, saved, 1);
    try std.testing.expect(try h.history.undo(h.session));
    var undone = try h.query(&.{.{ .section = 0, .paragraph = 1 }});
    defer undone.deinit();
    g[0].ref = undone.rows[0].ref;
    g[0].insertion.character.text_color = 0;
    try std.testing.expect(!try h.service().apply(a, request(&undone, &g)));
    try std.testing.expectEqual(@as(usize, 1), h.history.stats().redoCount);
}
test "H5 H01 rich late resource and version rejection leave no text no DocInfo no history" {
    for ([_]u8{ 0, 1 }) |which| {
        var h = try H.init(a);
        defer h.deinit();
        var q = try h.query(&.{ .{ .section = 0, .paragraph = 1 }, .{ .section = 0, .paragraph = 3 } });
        defer q.deinit();
        const before = try h.save();
        defer a.free(before);
        const e = [_]m.edits.Edit{.{ .start = 0, .end = 0, .text = "NEW", .expected = "" }};
        var bad: fmt.Patch = .{ .character = .{ .text_color = 0x123456 } };
        if (which == 0) bad.character.font_ids = .{ 65000, null, null, null, null, null, null } else bad.character.strike_color = 0x554433;
        const g = [_]m.Group{ .{ .ref = q.rows[0].ref, .before_units = 6, .edits = &e, .insertion = intent() }, .{ .ref = q.rows[1].ref, .before_units = 0, .edits = &e, .insertion = bad } };
        if (which == 0) try std.testing.expectError(error.InvalidFontId, h.service().apply(a, request(&q, &g))) else try std.testing.expectError(error.MissingCharacterStrikeColorField, h.service().apply(a, request(&q, &g)));
        try unchanged(&h, before, 0);
    }
}
test "H5 H01 rich prepared input and font buffers are owned after return" {
    var h = try H.init(a);
    defer h.deinit();
    var q = try h.query(&.{.{ .section = 0, .paragraph = 3 }});
    defer q.deinit();
    const inserted = try a.dupe(u8, "BUFFER");
    defer a.free(inserted);
    const font = try a.dupe(u8, "Owned Font");
    defer a.free(font);
    const e = [_]m.edits.Edit{.{ .start = 0, .end = 0, .text = inserted, .expected = "" }};
    const g = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = 0, .edits = &e, .insertion = .{ .character = .{ .text_color = 0x123456 }, .fonts = .{ .{ .name = font }, null, null, null, null, null, null } } }};
    try std.testing.expect(try h.service().apply(a, request(&q, &g)));
    @memset(inserted, 'X');
    @memset(font, 'Y');
    try text(h.session, 3, "BUFFER");
    const faces = try h.session.fontFaces(a);
    defer @import("../../model/font_face_value.zig").deinit(a, faces);
    var found = false;
    for (faces) |f| if (f.name) |n| {
        if (std.mem.eql(u8, n, "Owned Font")) found = true;
    };
    try std.testing.expect(found);
}
test "H5 H01 rich OOM bounded full service batch exact rollback and single history" {
    var measured: usize = 0;
    var failures: usize = 0;
    for (0..33) |sample| {
        var fa = std.testing.FailingAllocator.init(a, .{});
        var h = try H.init(fa.allocator());
        defer h.deinit();
        var q = try h.query(&.{ .{ .section = 0, .paragraph = 1 }, .{ .section = 0, .paragraph = 3 } });
        defer q.deinit();
        const before = try h.save();
        defer a.free(before);
        const e = [_]m.edits.Edit{.{ .start = 0, .end = 0, .text = "한😀LONGINPUT", .expected = "" }};
        const g = [_]m.Group{ .{ .ref = q.rows[0].ref, .before_units = 6, .edits = &e, .insertion = intent() }, .{ .ref = q.rows[1].ref, .before_units = 0, .edits = &e, .insertion = intent() } };
        const before_stats = h.history.stats();
        const begin = fa.alloc_index;
        if (sample != 0) fa.fail_index = begin + (sample - 1) * measured / 32;
        const result = h.service().apply(fa.allocator(), request(&q, &g));
        if (sample == 0) measured = fa.alloc_index - begin;
        fa.fail_index = std.math.maxInt(usize);
        const changed = result catch |err| blk: {
            try std.testing.expect(err == error.OutOfMemory);
            failures += 1;
            try unchanged(&h, before, 0);
            try std.testing.expectEqualDeep(before_stats, h.history.stats());
            break :blk false;
        };
        if (changed) try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    }
    try std.testing.expect(failures > 0);
    std.debug.print("H5 H01 service OOM samples=32 opportunities={} exact_failures={}\n", .{ measured, failures });
}

test "H5 H01 rich native formatting command budget rejects before any text or history" {
    var h = try H.init(a);
    defer h.deinit();
    const count: usize = 600;
    const original = try a.alloc(u8, count * 2);
    defer a.free(original);
    for (0..count) |i| {
        @memcpy(original[i * 2 ..][0..2], "a ");
    }
    _ = try h.history.apply(h.session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 6, .utf8 = original } });
    var q = try h.query(&.{.{ .section = 0, .paragraph = 1 }});
    defer q.deinit();
    const before = try h.save();
    defer a.free(before);
    const edits = try a.alloc(m.edits.Edit, count);
    defer a.free(edits);
    for (edits, 0..) |*e, i| e.* = .{ .start = @intCast(i * 2), .end = @intCast(i * 2 + 1), .text = "b", .expected = "a" };
    const g = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = @intCast(count * 2), .edits = edits, .insertion = intent() }};
    try std.testing.expectError(error.LimitExceeded, h.service().apply(a, request(&q, &g)));
    try unchanged(&h, before, 1);
}
test "H5 H01 rich late expected mismatch stale ref and syntax failures do not mutate" {
    var h = try H.init(a);
    defer h.deinit();
    var q = try h.query(&.{ .{ .section = 0, .paragraph = 1 }, .{ .section = 0, .paragraph = 2 } });
    defer q.deinit();
    const before = try h.save();
    defer a.free(before);
    const first = [_]m.edits.Edit{.{ .start = 0, .end = 0, .text = "PREFIX", .expected = "" }};
    const wrong = [_]m.edits.Edit{.{ .start = 0, .end = 4, .text = "X", .expected = "FAIL" }};
    var g = [_]m.Group{ .{ .ref = q.rows[0].ref, .before_units = 6, .edits = &first, .insertion = intent() }, .{ .ref = q.rows[1].ref, .before_units = 4, .edits = &wrong, .insertion = intent() } };
    try std.testing.expectError(error.ExpectedTextMismatch, h.service().apply(a, request(&q, &g)));
    try unchanged(&h, before, 0);
    g[1].edits = &.{.{ .start = 0, .end = 0, .text = "X", .expected = "" }};
    g[1].insertion.fonts[6] = .{ .name = "" };
    try std.testing.expectError(error.InvalidFontName, h.service().apply(a, request(&q, &g)));
    try unchanged(&h, before, 0);
    g[1].insertion = intent();
    g[1].insertion.character.text_color = 0x1000000;
    try std.testing.expectError(error.InvalidCharacterColor, h.service().apply(a, request(&q, &g)));
    try unchanged(&h, before, 0);
    g[1].insertion = intent();
    try std.testing.expect(try h.service().apply(a, request(&q, &g)));
    const committed = try h.save();
    defer a.free(committed);
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, request(&q, &g)));
    try unchanged(&h, committed, 1);
}

test "H5 H01 rich sparse false color zero and seven font ID zero clear existing style" {
    var h = try H.initStyled(a, true);
    defer h.deinit();
    try style(h.session, 2, 0, 0x123456, true);
    var q = try h.query(&.{.{ .section = 0, .paragraph = 2 }});
    defer q.deinit();
    const e = [_]m.edits.Edit{.{ .start = 0, .end = 4, .text = "TAIL", .expected = "TAIL" }};
    const g = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = 4, .edits = &e, .insertion = .{ .character = .{ .bold = false, .italic = false, .underline_kind = .none, .underline_color = 0, .strike_enabled = false, .text_color = 0, .font_ids = @splat(0) } } }};
    try std.testing.expect(try h.service().apply(a, request(&q, &g)));
    try text(h.session, 2, "TAIL");
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    const id = try resource(h.session, 2, 0);
    const shapes = try h.session.characterShapes(a);
    defer a.free(shapes);
    var found = false;
    for (shapes) |shape| if (shape.id == id) {
        found = true;
        try std.testing.expect(!shape.bold);
        try std.testing.expect(!shape.italic);
        try std.testing.expectEqual(@as(u2, 0), shape.underline_kind_raw);
        try std.testing.expectEqual(@as(u32, 0), shape.text_color_raw);
        try std.testing.expectEqualDeep(@as([7]u16, @splat(0)), shape.font_ids);
        try std.testing.expectEqual(@as(u3, 0), shape.strike_kind_raw);
    };
    try std.testing.expect(found);
    const saved = try h.save();
    defer a.free(saved);
    const reopened = try edit.Session.open(a, saved);
    defer reopened.close();
    try style(reopened, 2, 0, 0, false);
}
test "H5 H01 rich deletion alone rejects explicit style while G05 plain deletion remains supported" {
    var h = try H.init(a);
    defer h.deinit();
    var q = try h.query(&.{.{ .section = 0, .paragraph = 1 }});
    defer q.deinit();
    const before = try h.save();
    defer a.free(before);
    const e = [_]m.edits.Edit{.{ .start = 0, .end = 1, .text = "", .expected = "a" }};
    var g = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = 6, .edits = &e, .insertion = .{ .character = .{ .bold = true } } }};
    try std.testing.expectError(error.EmptyStyledTextInsertion, h.service().apply(a, request(&q, &g)));
    try unchanged(&h, before, 0);
    g[0].insertion = .{};
    try std.testing.expect(try h.service().apply(a, request(&q, &g)));
    try text(h.session, 1, "b😀cd");
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
}

test "H5 H01 rich grouped run work N 2N 4N actual service" {
    for ([_]usize{ 32, 64, 128 }) |n| {
        var h = try H.initMany(a, false, n);
        defer h.deinit();
        var q = try h.query(&.{.{ .section = 0, .paragraph = 1 }});
        defer q.deinit();
        const edits = try a.alloc(m.edits.Edit, n);
        defer a.free(edits);
        for (edits, 0..) |*e, i| e.* = .{ .start = @intCast(i * 3), .end = @intCast(i * 3 + 1), .text = "😀", .expected = "a" };
        const groups = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = @intCast(n * 3), .edits = edits, .insertion = intent() }};
        var w: tx.Service.Testing.Work = .{};
        try std.testing.expect(try tx.Service.Testing.applyMeasured(h.service(), a, request(&q, &groups), &w));
        try std.testing.expectEqual(@as(usize, 1), w.paragraphs);
        try std.testing.expectEqual(n * 8 + 2, w.materialized_bytes);
        try std.testing.expectEqual(n * 2 + 1, w.validated_runs);
        try std.testing.expectEqual(n * 2 + 1, w.run_rows);
        try std.testing.expectEqual(n, w.range_rows);
        try std.testing.expectEqual(n, w.range_advances);
        try std.testing.expectEqual(n, w.intersections);
        try std.testing.expectEqual(@as(usize, 1), w.resource_lookups);
        try std.testing.expectEqual(@as(usize, 7), w.font_names);
        try std.testing.expectEqual(n * 3, w.output_rows);
        try std.testing.expectEqual(@as(u32, 1), h.history.revision());
        try style(h.session, 1, @intCast((n - 1) * 4), 0x123456, true);
        try style(h.session, 1, @intCast((n - 1) * 4 + 2), 0, false);
        std.debug.print("H5 grouped work N={} paragraphs={} bytes={} validated_runs={} run_rows={} ranges={} advances={} intersections={} lookups={} font_names={} output={} controls={}\n", .{ n, w.paragraphs, w.materialized_bytes, w.validated_runs, w.run_rows, w.range_rows, w.range_advances, w.intersections, w.resource_lookups, w.font_names, w.output_rows, w.controls });
    }
}

fn expectEquivalentStyles(left: *edit.Session, right: *edit.Session, paragraph: usize) !void {
    const l = try left.characterShapes(a);
    defer a.free(l);
    const r = try right.characterShapes(a);
    defer a.free(r);
    const count = try left.editableTextLength(a, 0, paragraph);
    try std.testing.expectEqual(count, try right.editableTextLength(a, 0, paragraph));
    for (0..count + 1) |unit| {
        const li = try resource(left, paragraph, @intCast(unit));
        const ri = try resource(right, paragraph, @intCast(unit));
        var ls = l[li];
        var rs = r[ri];
        ls.id = 0;
        rs.id = 0;
        try std.testing.expectEqualDeep(ls, rs);
    }
}
test "H5 H01 rich grouped matches previous sequential style semantics on mixed original runs" {
    var now = try H.initMany(a, false, 4);
    defer now.deinit();
    var old = try H.initMany(a, false, 4);
    defer old.deinit();
    var q = try now.query(&.{.{ .section = 0, .paragraph = 1 }});
    defer q.deinit();
    const edits = [_]m.edits.Edit{ .{ .start = 0, .end = 2, .text = "a ", .expected = "a " }, .{ .start = 3, .end = 5, .text = "a ", .expected = "a " }, .{ .start = 7, .end = 8, .text = "😀", .expected = " " }, .{ .start = 12, .end = 12, .text = "Z", .expected = "" } };
    const patch = intent();
    const group = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = 12, .edits = &edits, .insertion = patch }};
    const ranges = try @import("../../model/text_transaction_insertions.zig").prepare(a, &edits, 12);
    defer a.free(ranges);
    const text_groups = [_]@import("independent_text_session.zig").Group{.{ .section = 0, .paragraph = 1, .edits = &edits }};
    var commands: std.ArrayList(edit.Command) = .empty;
    defer commands.deinit(a);
    try commands.append(a, .{ .splice_independent_text = &text_groups });
    for (ranges) |range| {
        try commands.append(a, .{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = range.startUnit, .end_unit = range.endUnit, .properties = patch.character } });
        for (languages, names) |language, name| try commands.append(a, .{ .set_character_font_name = .{ .section = 0, .paragraph = 1, .start_unit = range.startUnit, .end_unit = range.endUnit, .language = language, .name = name } });
    }
    {
        var scope: edit.FormattingBatch = .{};
        try old.session.beginFormattingBatch(&scope);
        defer old.session.endFormattingBatch(&scope);
        try std.testing.expect(try old.history.applyBatch(old.session, commands.items));
    }
    try std.testing.expect(try now.service().apply(a, request(&q, &group)));
    try expectEquivalentStyles(now.session, old.session, 1);
    try text(now.session, 1, "a ba ba😀ba bZ");
    const l = try now.save();
    defer a.free(l);
    const r = try old.save();
    defer a.free(r);
    const ls = try edit.Session.open(a, l);
    defer ls.close();
    const rs = try edit.Session.open(a, r);
    defer rs.close();
    try expectEquivalentStyles(ls, rs, 1);
}
test "H5 H01 rich grouped retains invalid explicit ID despite later named font" {
    var h = try H.init(a);
    defer h.deinit();
    const before = try h.save();
    defer a.free(before);
    var q = try h.query(&.{.{ .section = 0, .paragraph = 3 }});
    defer q.deinit();
    const e = [_]m.edits.Edit{.{ .start = 0, .end = 0, .text = "X", .expected = "" }};
    var p = intent();
    p.character.font_ids = .{ 65000, null, null, null, null, null, null };
    const g = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = 0, .edits = &e, .insertion = p }};
    try std.testing.expectError(error.InvalidFontId, h.service().apply(a, request(&q, &g)));
    try unchanged(&h, before, 0);
}
