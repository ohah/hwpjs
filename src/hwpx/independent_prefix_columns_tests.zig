//! Constructor-only default HWPX and fixed section-prefix regressions.
const std = @import("std");
const editor = @import("editor_session.zig");
const hist = @import("editor_history.zig");
const tx = @import("text_transaction.zig");
const m = @import("../model/text_transaction.zig");
const f = @import("../model/formatting_patch.zig");
const State = @import("../model/formatting_binding.zig").State;
const a = std.testing.allocator;
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

const owner: f.Owner = .{ .section = 0, .paragraph = 1 };
const replace_edits: []const m.edits.Edit = &.{
    .{ .start = 0, .end = 1, .text = "한😀", .expected = "A" },
    .{ .start = 3, .end = 4, .text = "끝", .expected = "A" },
};

fn group(q: *const tx.Snapshot, edits: []const m.edits.Edit) m.Group {
    return .{ .ref = q.rows[0].ref, .before_units = q.rows[0].before_units, .edits = edits };
}
fn complete(q: *const tx.Snapshot, groups: []const m.Group) m.Apply {
    return .{ .binding = q.binding, .scope = .@"complete-current-paragraph-snapshot", .coverage = q.coverage, .groups = groups };
}
fn typed(h: *Harness, text: []const u8) !void {
    try std.testing.expect(try h.history.apply(h.session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = text }));
}
fn position(h: *Harness) !@import("column_boundary_position.zig").Position {
    const rows = h.session.sections[0].structure_values.?.paragraphs[0].column_boundaries.?;
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(u32, 0), rows[0].unit);
    try std.testing.expectEqual(.left, rows[0].affinity);
    return rows[0];
}
fn savedEqual(session: *editor.Session, expected: []const u8) !void {
    const bytes = try session.save();
    defer session.allocator.free(bytes);
    try std.testing.expectEqualSlices(u8, expected, bytes);
}
fn archive(label: []const u8, bytes: []const u8) !void {
    const encoding = std.base64.standard.Encoder;
    const encoded = try a.alloc(u8, encoding.calcSize(bytes.len));
    defer a.free(encoded);
    std.debug.print("PREFIX_COLUMN_ARCHIVE {s} {s}\n", .{ label, encoding.encode(encoded, bytes) });
}

test "HX prefix columns default new document typed and two edits complete snapshot exact travel" {
    const original = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(original);
    var h = try Harness.init(a, original);
    defer h.deinit();
    var empty = try h.query(&.{owner});
    defer empty.deinit();
    try std.testing.expectEqual(@as(u32, 0), empty.rows[0].before_units);
    try typed(&h, "A😀A");
    const prefix = try position(&h);
    var q = try h.query(&.{owner});
    defer q.deinit();
    try std.testing.expectEqual(@as(u32, 4), q.rows[0].before_units);
    try std.testing.expectEqual(@as(u32, 1), q.coverage.paragraphs);
    try std.testing.expect(!try h.service().apply(a, complete(&q, &.{})));
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    try h.text(0, 1, "A😀A");
    try std.testing.expectEqualDeep(prefix, try position(&h));
    try std.testing.expect(try h.service().apply(a, complete(&q, &.{group(&q, replace_edits)})));
    try std.testing.expectEqual(@as(u32, 2), h.history.revision());
    try h.text(0, 1, "한😀😀끝");
    try std.testing.expectEqualDeep(prefix, try position(&h));
    const after = try h.session.save();
    defer a.free(after);
    var reopened = try Harness.init(a, after);
    defer reopened.deinit();
    try reopened.text(0, 1, "한😀😀끝");
    var reopened_query = try reopened.query(&.{owner});
    defer reopened_query.deinit();
    try std.testing.expectEqual(@as(u32, 6), reopened_query.rows[0].before_units);
    try savedEqual(reopened.session, after);

    try std.testing.expect(try h.history.undo(h.session));
    try h.text(0, 1, "A😀A");
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expectEqualDeep(prefix, try position(&h));
    try std.testing.expect(try h.history.redo(h.session));
    try savedEqual(h.session, after);
    try std.testing.expectEqualDeep(prefix, try position(&h));

    try archive("original", original);
    try archive("before", before);
    try archive("after", after);
}

fn variant(seed: []const u8, old: []const u8, new: []const u8) ![]u8 {
    var session = try editor.open(a, seed, .{});
    defer session.deinit();
    const xml = session.sections[0].tree.source;
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, old));
    const changed = try std.mem.replaceOwned(u8, a, xml, old, new);
    defer a.free(changed);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, changed, session.original_header.?.source);
}

test "HX prefix columns offset zero insertion preserves prefix and inline anchor offsets" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    const bytes = try variant(seed, "<hp:t/>", "<hp:t>A</hp:t></hp:run><hp:run charPrIDRef=\"0\"><hp:t><hp:tab/>B</hp:t><hp:pic/><hp:t>😀C</hp:t>");
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    var q = try h.query(&.{owner});
    defer q.deinit();
    try std.testing.expectEqual(@as(u32, 7), q.rows[0].before_units);
    const invalid: []const m.edits.Edit = &.{.{ .start = 3, .end = 4, .text = "X", .expected = "￼" }};
    try std.testing.expectError(error.ProtectedInlineControl, h.service().apply(a, complete(&q, &.{group(&q, invalid)})));
    try savedEqual(h.session, bytes);
    const edits: []const m.edits.Edit = &.{
        .{ .start = 0, .end = 0, .text = "😀", .expected = "" },
        .{ .start = 6, .end = 7, .text = "끝", .expected = "C" },
    };
    try std.testing.expect(try h.service().apply(a, complete(&q, &.{group(&q, edits)})));
    try h.text(0, 1, "😀A\tB￼😀끝");
    const after = try h.session.save();
    defer a.free(after);
    var reopened = try Harness.init(a, after);
    defer reopened.deinit();
    try reopened.text(0, 1, "😀A\tB￼😀끝");
    try std.testing.expect(try h.history.undo(h.session));
    try savedEqual(h.session, bytes);
    try std.testing.expect(try h.history.redo(h.session));
    try savedEqual(h.session, after);
    try archive("anchor_before", bytes);
    try archive("anchor_after", after);
}

test "HX prefix columns rejects multi column and damaged source declarations" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    for ([_][]const u8{ "2", "broken", "0" }) |count| {
        const attr = try std.fmt.allocPrint(a, "colCount=\"{s}\"", .{count});
        defer a.free(attr);
        const bytes = try variant(seed, "colCount=\"1\"", attr);
        defer a.free(bytes);
        var h = try Harness.init(a, bytes);
        defer h.deinit();
        try std.testing.expectError(error.UnsupportedIndependentColumnMetadata, h.query(&.{owner}));
        try savedEqual(h.session, bytes);
        try std.testing.expectEqual(@as(u32, 0), h.history.revision());
        if (std.mem.eql(u8, count, "2")) {
            try typed(&h, "A😀A");
            _ = try position(&h);
            const typed_bytes = try h.session.save();
            defer a.free(typed_bytes);
            try std.testing.expectError(error.UnsupportedIndependentColumnMetadata, h.query(&.{owner}));
            try savedEqual(h.session, typed_bytes);
            try std.testing.expectEqual(@as(u32, 1), h.history.revision());
        }
    }
    const bytes = try variant(seed, "</hp:secPr>", "</hp:secPr><hp:secPr/>");
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expectError(error.UnsupportedIndependentColumnMetadata, h.query(&.{owner}));
    try savedEqual(h.session, bytes);
}

test "HX prefix columns rejects corrupt materialized identity coordinate affinity and ownership" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var h = try Harness.init(a, seed);
    defer h.deinit();
    try typed(&h, "A😀A");
    const before = try h.session.save();
    defer a.free(before);
    var q = try h.query(&.{owner});
    defer q.deinit();
    const paragraph = &h.session.sections[0].structure_values.?.paragraphs[0];
    const rows = paragraph.column_boundaries.?;
    const actual = rows[0];
    for (0..4) |kind| {
        switch (kind) {
            0 => rows[0].unit = 1,
            1 => rows[0].affinity = .right,
            2 => rows[0].source_element = 0,
            3 => paragraph.column_boundaries = rows[0..0],
            else => unreachable,
        }
        try std.testing.expectError(error.UnsupportedIndependentColumnMetadata, h.service().apply(a, complete(&q, &.{group(&q, replace_edits)})));
        paragraph.column_boundaries = rows;
        rows[0] = actual;
        try savedEqual(h.session, before);
        try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    }
    var context = try @import("independent_text_session.zig").Context.init(h.session);
    defer context.deinit();
    try context.preflight(0, 1, 4, replace_edits);
    rows[0].affinity = .right;
    defer rows[0] = actual;
    try std.testing.expectError(error.StaleIndependentTextContext, context.validatePrepared());
}

test "HX prefix columns refuses inline controls in the declaration run" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    const bytes = try variant(seed, "<hp:t/>", "<hp:t>A<hp:tab/>B</hp:t><hp:pic/><hp:t>C</hp:t>");
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try std.testing.expectError(error.UnsupportedIndependentColumnMetadata, h.query(&.{owner}));
    try savedEqual(h.session, bytes);
}

test "HX prefix columns pending created cell remains outside independent edit authority" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    const bytes = try variant(seed, "</hs:sec>", "<hp:p id='2' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:t>HOST</hp:t></hp:run></hp:p></hs:sec>");
    defer a.free(bytes);
    var h = try Harness.init(a, bytes);
    defer h.deinit();
    try typed(&h, "A😀A");
    var ids = try @import("created_table_source_ids.zig").plan(h.session, 1);
    defer ids.deinit(a);
    const plan = try @import("../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1);
    var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, plan, ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "CELL", 100);
    try std.testing.expect(try h.history.apply(h.session, .{ .kind = .created_table_stage, .paragraph = 2, .start = 4, .deleted = 0, .inserted = "", .created_table = &table }));
    const revision = h.history.revision();
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expectError(error.UnsupportedIndependentCreatedTableMetadata, h.query(&.{owner}));
    var q = try h.query(&.{});
    defer q.deinit();
    try std.testing.expectEqual(@as(u32, 3), q.coverage.paragraphs);
    try std.testing.expectEqual(@as(u32, 1), q.coverage.created_cell_paragraphs);
    const ref = try @import("../model/text_transaction_binding.zig").reference(h.lifetime, a, revision, .{ .owner = owner });
    defer a.free(ref);
    const attempt: m.Group = .{ .ref = ref, .before_units = 4, .edits = replace_edits };
    try std.testing.expectError(error.UnsupportedIndependentCreatedTableMetadata, h.service().apply(a, complete(&q, &.{attempt})));
    try std.testing.expectEqual(revision, h.history.revision());
    try savedEqual(h.session, before);
}

test "HX prefix columns allocation failure preserves authored prefix bytes and revision" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var measured: usize = 0;
    var restored: usize = 0;
    for (0..9) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const allocator = failing.allocator();
        var h = try Harness.init(allocator, seed);
        defer h.deinit();
        try typed(&h, "A😀A");
        const prefix = try position(&h);
        const before = try h.session.save();
        defer allocator.free(before);
        var q = try h.query(&.{owner});
        defer q.deinit();
        const begin = failing.alloc_index;
        if (sample != 0) failing.fail_index = begin + (sample - 1) * (measured - 1) / 7;
        const changed = h.service().apply(allocator, complete(&q, &.{group(&q, replace_edits)})) catch |err| recovered: {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            restored += 1;
            break :recovered false;
        };
        if (sample == 0) measured = failing.alloc_index - begin;
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expectEqual(sample == 0, changed);
        if (sample != 0) {
            try std.testing.expectEqual(@as(u32, 1), try h.service().currentRevision());
            try std.testing.expect(!h.history.stats().poisoned);
            try std.testing.expectEqualDeep(prefix, try position(&h));
            try savedEqual(h.session, before);
        }
    }
    try std.testing.expectEqual(@as(usize, 8), restored);
    std.debug.print("PREFIX_COLUMN_OOM opportunities={d} restored={d}\n", .{ measured, restored });
}
