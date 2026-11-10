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

const names = [_][]const u8{ "H01 Hangul", "H01 Latin", "H01 Hanja", "H01 Japanese", "H01 Other", "H01 Symbol", "H01 User" };
const langs = @import("../model/character_fonts.zig").languages;
fn richPatch() f.Patch {
    var p: f.Patch = .{ .character = .{ .bold = true, .italic = false, .size = 1900, .text_color = 0x123456, .underline_kind = .bottom, .underline_color = 0x224466, .underline_style = .DASH, .strike_enabled = true, .strike_style = .SOLID, .strike_color = 0x654321 } };
    for (names, 0..) |name, i| p.fonts[i] = .{ .name = name };
    return p;
}
test "HX H01 late resource output limit rollback restores bytes fonts styles and redo" {
    const bytes = try input(a, plain);
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expect(try h.history.apply(h.session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
    try std.testing.expect(try h.history.undo(h.session));
    h.session.options.max_xml_bytes = 5000;
    var q = try h.query(&.{owners[0]});
    defer q.deinit();
    var g = group(q.rows[0], &.{.{ .start = 0, .end = 1, .text = "한😀LONGINPUT", .expected = "A" }});
    g.insertion = richPatch();
    const serial = h.session.mutation_serial;
    const stats = h.history.stats();
    try std.testing.expectError(error.LimitExceeded, h.service().apply(a, request(&q, &.{g})));
    try std.testing.expectEqualDeep(stats, h.history.stats());
    try std.testing.expectEqual(serial + 1, h.session.mutation_serial);
    try std.testing.expectEqual(stats.revision, try h.service().currentRevision());
    try std.testing.expect(!h.history.stats().poisoned);
    try std.testing.expect(h.session.formatting_batch == null);
    try std.testing.expectEqual(@as(usize, 0), h.session.character_resources.entries.items.len);
    try std.testing.expectEqual(@as(usize, 0), h.session.font_resources.entries.items.len);
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.history.redo(h.session));
    try h.text(0, 2, "!OTHER");
    std.debug.print("H01_LATE_RESOURCE_LIMIT actualHistoryRollback=true exact_bytes=true redo=true\n", .{});
}
