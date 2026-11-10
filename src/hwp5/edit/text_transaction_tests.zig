//! Actual source-backed Service/Session/History only; memory constructors.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const tx = @import("text_transaction.zig");
const m = @import("../../model/text_transaction.zig");
const State = @import("../../model/formatting_binding.zig").State;
const Owner = @import("../../model/formatting_patch.zig").Owner;
const a = std.testing.allocator;
const Harness = struct {
    allocator: std.mem.Allocator,
    session: *edit.Session,
    history: History,
    lifetime: State,
    fn init() !Harness {
        return initWith(a);
    }
    fn initWith(allocator: std.mem.Allocator) !Harness {
        const bytes = try @import("../../new_document/root.zig").hwp5(allocator);
        defer allocator.free(bytes);
        const session = try edit.Session.open(allocator, bytes);
        errdefer session.close();
        try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "ab😀ab" } });
        try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 6 } });
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "tail ab" } });
        session.enableHistoryDelta();
        var lifetime: State = .{};
        try lifetime.open();
        return .{ .allocator = allocator, .session = session, .history = try History.initV2(allocator, session, .{ .max_entries = 16 }), .lifetime = lifetime };
    }
    fn service(self: *Harness) tx.Service {
        return .{ .session = self.session, .history = &self.history, .lifetime = &self.lifetime };
    }
    fn query(self: *Harness, selected: []const Owner) !tx.Snapshot {
        const id = try self.lifetime.session(self.allocator);
        defer self.allocator.free(id);
        return self.service().query(self.allocator, .{ .session = id, .revision = self.history.revision() }, selected);
    }
    fn deinit(self: *Harness) void {
        self.history.deinit();
        self.session.close();
    }
    fn save(self: *Harness) ![]u8 {
        return (try self.session.save(self.allocator, .{ .allow_stale_layout = true })).bytes;
    }
};
fn expectText(session: *edit.Session, paragraph: usize, expected: []const u8) !void {
    const actual = try session.copyText(a, 0, paragraph);
    defer a.free(actual);
    const terminated = try std.mem.concat(a, u8, &.{ expected, "\r" });
    defer a.free(terminated);
    const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, terminated);
    defer a.free(utf16);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(utf16), actual);
}
const table_options: @import("created_table_records.zig").Options = .{
    .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "Independent text scope" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};
fn tableInput() ![]u8 {
    var h = try Harness.init();
    defer h.deinit();
    var ids = try h.session.planTableIds(1);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "CELL😀AB", 100);
    try h.session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 2, .unit = 0, .table = &table, .options = table_options } });
    return h.save();
}
fn twoSectionInput() ![]u8 {
    var h = try Harness.init();
    defer h.deinit();
    const input = try h.save();
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const count = try @import("../docinfo/section_count.zig").locate(info, source.header.version());
    std.mem.writeInt(u16, info[count.payload_offset..][0..2], 2, .little);
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    const encoded_info = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, info, 4_000_000) else try a.dupe(u8, info);
    defer a.free(encoded_info);
    const encoded_body = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, body, 4_000_000) else try a.dupe(u8, body);
    defer a.free(encoded_body);
    return @import("../test_section_count_fixture.zig").build(a, &source.header.raw, encoded_info, encoded_body, &.{ "Section0", "Section1" });
}
const owners = [_]Owner{ .{ .section = 0, .paragraph = 1 }, .{ .section = 0, .paragraph = 2 } };
fn requestFor(q: *const tx.Snapshot, groups: []const m.Group) m.Apply {
    return .{ .binding = q.binding, .scope = .selection, .coverage = null, .groups = groups };
}
fn groupsFor(q: *const tx.Snapshot) [2]m.Group {
    return .{
        .{ .ref = q.rows[0].ref, .before_units = q.rows[0].before_units, .edits = &.{ .{ .start = 0, .end = 2, .text = "XY", .expected = "ab" }, .{ .start = 4, .end = 6, .text = "Z", .expected = "ab" } } },
        .{ .ref = q.rows[1].ref, .before_units = q.rows[1].before_units, .edits = &.{.{ .start = 5, .end = 7, .text = "한", .expected = "ab" }} },
    };
}
fn sameSave(h: *Harness, before: []const u8, stats: @import("../../model/history_stats.zig").Stats) !void {
    const after = try h.save();
    defer h.allocator.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualDeep(stats, h.history.stats());
}
test "H5 text service typed query generated targets one history undo redo and owned snapshots" {
    var h = try Harness.init();
    defer h.deinit();
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    var q = try h.query(&owners);
    defer q.deinit();
    try sameSave(&h, before, stats);
    try std.testing.expectEqual(@as(u32, 3), q.coverage.paragraphs);
    try std.testing.expect(q.rows[0].current.source.host == .generated_instance);
    const groups = groupsFor(&q);
    try std.testing.expect(try h.service().apply(a, requestFor(&q, &groups)));
    try expectText(h.session, 1, "XY😀Z");
    try expectText(h.session, 2, "tail 한");
    try std.testing.expectEqual(@as(usize, 1), h.history.stats().undoCount);
    const after = try h.save();
    defer a.free(after);
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, requestFor(&q, &groups)));
    try std.testing.expect(try h.history.undo(h.session));
    const undone = try h.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try h.history.redo(h.session));
    const redone = try h.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "H5 text service admission late failures aliases expected scalar controls and formatting readonly" {
    var h = try Harness.init();
    defer h.deinit();
    var q = try h.query(&owners);
    defer q.deinit();
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    var g = groupsFor(&q);
    g[1].edits = &.{.{ .start = 5, .end = 7, .text = "X", .expected = "zz" }};
    try std.testing.expectError(error.ExpectedTextMismatch, h.service().apply(a, requestFor(&q, &g)));
    try sameSave(&h, before, stats);
    g = groupsFor(&q);
    g[1].before_units += 1;
    try std.testing.expectError(error.TextTransactionBeforeMismatch, h.service().apply(a, requestFor(&q, &g)));
    try sameSave(&h, before, stats);
    g = groupsFor(&q);
    g[0].edits = &.{.{ .start = 3, .end = 3, .text = "X", .expected = "" }};
    try std.testing.expectError(error.SplitSurrogatePair, h.service().apply(a, requestFor(&q, &g)));
    try sameSave(&h, before, stats);
    g = groupsFor(&q);
    g[1].edits = &.{.{ .start = 5, .end = 5, .text = "\n", .expected = "" }};
    try std.testing.expectError(error.UnsupportedTextControl, h.service().apply(a, requestFor(&q, &g)));
    try sameSave(&h, before, stats);
    g = groupsFor(&q);
    g[1].insertion.reset = .character;
    try std.testing.expectError(error.UnsupportedTextInsertionFormatting, h.service().apply(a, requestFor(&q, &g)));
    try sameSave(&h, before, stats);
    g = groupsFor(&q);
    g[1].ref = "t1-p1:0:1:r0:k2:b9";
    try std.testing.expectError(error.DuplicateTextTransactionTarget, h.service().apply(a, requestFor(&q, &g)));
    try sameSave(&h, before, stats);
    g = groupsFor(&q);
    g[1].ref = "t1-p1:0:2:r0:k1:b0";
    try std.testing.expectError(error.UnsupportedTextTransactionTarget, h.service().apply(a, requestFor(&q, &g)));
    try sameSave(&h, before, stats);
    try std.testing.expectError(error.DuplicateTextTransactionTarget, h.query(&.{ owners[0], owners[0] }));
    try sameSave(&h, before, stats);
}
test "H5 text service noops preserve redo and stale refs rebind lifetime reject" {
    var h = try Harness.init();
    defer h.deinit();
    var first = try h.query(&owners);
    defer first.deinit();
    const groups = groupsFor(&first);
    _ = try h.service().apply(a, requestFor(&first, &groups));
    _ = try h.history.undo(h.session);
    var q = try h.query(&owners);
    defer q.deinit();
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    const noop = [_]m.Group{.{ .ref = q.rows[0].ref, .before_units = q.rows[0].before_units, .edits = &.{.{ .start = 0, .end = 2, .text = "ab", .expected = "ab" }} }};
    try std.testing.expect(!try h.service().apply(a, requestFor(&q, &noop)));
    try sameSave(&h, before, stats);
    var stale = noop;
    stale[0].ref = "t1-p1:0:1:r99:k0:b0";
    try std.testing.expectError(error.StaleTextTransactionReference, h.service().apply(a, requestFor(&q, &stale)));
    try h.lifetime.open();
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, requestFor(&q, &noop)));
    h.lifetime.close();
    try std.testing.expectError(error.EditorNotOpen, h.query(&owners));
}
test "H5 text service rejects foreign legacy unmanaged active poisoned and stale history tickets" {
    var h = try Harness.init();
    defer h.deinit();
    var foreign = try Harness.init();
    defer foreign.deinit();
    const b: @import("../../model/formatting_patch.zig").Binding = .{ .session = "s1", .revision = 0 };
    var service = h.service();
    service.history = &foreign.history;
    try std.testing.expectError(error.SourceBindingMismatch, service.query(a, b, &owners));
    var legacy = try History.init(a, h.session, 8, 4_000_000);
    defer legacy.deinit();
    service = h.service();
    service.history = &legacy;
    try std.testing.expectError(error.HistoryProtocolRequired, service.query(a, b, &owners));
    const bytes = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(bytes);
    const unmanaged = try edit.Session.open(a, bytes);
    defer unmanaged.close();
    var uh = try History.initV2(a, unmanaged, .{ .max_entries = 8 });
    defer uh.deinit();
    service = h.service();
    service.session = unmanaged;
    service.history = &uh;
    try std.testing.expectError(error.HistoryProtocolRequired, service.query(a, b, &.{}));
    const ticket = try h.session.historyTicket();
    try h.session.beginHistoryTransaction(ticket);
    try std.testing.expectError(error.MutationInProgress, h.service().query(a, b, &owners));
    h.session.finishHistoryTransaction(false);
    try h.session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .utf8 = "Q" } });
    // An actual out-of-band write advances the managed mutation epoch.
    try std.testing.expectError(error.HistoryCurrentMismatch, h.service().query(a, b, &owners));
    foreign.history.owned.?.poisoned = true;
    try std.testing.expectError(error.HistoryMutationUncertain, foreign.query(&owners));
}
test "H5 text service original reopen and source context foreign binding reject" {
    var h = try Harness.init();
    defer h.deinit();
    const bytes = try h.save();
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    var state = h.lifetime;
    try state.open();
    const service: tx.Service = .{ .session = session, .history = &history, .lifetime = &state };
    try std.testing.expectError(error.StaleFormattingBinding, service.query(a, .{ .session = "s1", .revision = 0 }, &owners));
    var q = try service.query(a, .{ .session = "s2", .revision = 0 }, &owners);
    defer q.deinit();
    try std.testing.expect(q.rows[0].current.source.host == .original_node);
    const groups = groupsFor(&q);
    try std.testing.expect(try service.apply(a, requestFor(&q, &groups)));
    const wrong = try h.session.prepareIndependentSourceContext(0);
    defer wrong.destroy();
    try std.testing.expectError(error.SourceBindingMismatch, session.validateIndependentTextTarget(wrong, 0, 1, 5, &.{}));
}
test "H5 text service created coverage omission rejected from complete live inventory" {
    var h = try Harness.init();
    defer h.deinit();
    var q = try h.query(&owners);
    defer q.deinit();
    var ids = try h.session.planTableIds(1);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    _ = try h.history.apply(h.session, .{ .stage_table = .{ .section = 0, .paragraph = 2, .unit = 0, .table = &table, .options = table_options } });
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    const id = try h.lifetime.session(a);
    defer a.free(id);
    const coverage = try h.session.independentTextCoverage(a);
    defer a.free(coverage.sections);
    try std.testing.expectEqual(@as(u32, 4), coverage.paragraphs);
    try std.testing.expectEqual(@as(u32, 1), coverage.created_cell_paragraphs);
    const claim: m.Apply = .{ .binding = .{ .session = id, .revision = h.history.revision() }, .scope = .@"complete-current-paragraph-snapshot", .coverage = q.coverage, .groups = &.{} };
    try std.testing.expectError(error.IncompleteTextTransactionCoverage, h.service().apply(a, claim));
    try sameSave(&h, before, stats);
    try std.testing.expectError(error.UnsupportedIndependentCreatedTableHost, h.query(&owners));
}
test "H5 text service two section and nested source generated targets use actual sessions" {
    const bytes = try twoSectionInput();
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    var state: State = .{};
    try state.open();
    const service: tx.Service = .{ .session = session, .history = &history, .lifetime = &state };
    var q = try service.query(a, .{ .session = "s1", .revision = 0 }, &.{ owners[0], .{ .section = 1, .paragraph = 2 } });
    defer q.deinit();
    const groups = groupsFor(&q);
    try std.testing.expect(try service.apply(a, requestFor(&q, &groups)));
    try std.testing.expectEqual(@as(usize, 1), history.stats().undoCount);
    const table_bytes = try tableInput();
    defer a.free(table_bytes);
    const nested = try edit.Session.open(a, table_bytes);
    defer nested.close();
    nested.enableHistoryDelta();
    var nh = try History.initV2(a, nested, .{ .max_entries = 8 });
    defer nh.deinit();
    var ns: State = .{};
    try ns.open();
    const svc: tx.Service = .{ .session = nested, .history = &nh, .lifetime = &ns };
    const flow = try nested.paragraphFlow(a, 0);
    defer a.free(flow);
    var cell: ?usize = null;
    for (flow) |row| if (row.host == .table_cell) {
        cell = row.paragraph;
        break;
    };
    const index = cell orelse return error.MissingTestCell;
    for (0..2) |generated| {
        if (generated == 1) _ = try nh.apply(nested, .{ .split_paragraph = .{ .section = 0, .paragraph = index, .at_unit = 0 } });
        const selected = index + generated;
        var snapshot = try svc.query(a, .{ .session = "s1", .revision = nh.revision() }, &.{.{ .section = 0, .paragraph = selected }});
        defer snapshot.deinit();
        const g = [_]m.Group{.{ .ref = snapshot.rows[0].ref, .before_units = snapshot.rows[0].before_units, .edits = &.{.{ .start = 0, .end = 4, .text = "CELL2", .expected = "CELL" }} }};
        try std.testing.expect(try svc.apply(a, requestFor(&snapshot, &g)));
        try std.testing.expect(try nh.undo(nested));
    }
}
test "H5 text service sampled preflight and history OOM retain exact save and stats" {
    var measured: usize = 0;
    var failures: usize = 0;
    const samples = 32;
    for (0..samples + 1) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var h = try Harness.initWith(fa);
        defer h.deinit();
        var q = try h.query(&owners);
        defer q.deinit();
        const groups = groupsFor(&q);
        const before = try h.save();
        defer fa.free(before);
        const stats = h.history.stats();
        const start = failing.alloc_index;
        if (sample != 0) failing.fail_index = start + (sample - 1) * measured / @min(samples, measured);
        var failed = false;
        _ = h.service().apply(fa, requestFor(&q, &groups)) catch |err| block: {
            try std.testing.expectEqual(error.OutOfMemory, err);
            failed = true;
            break :block false;
        };
        if (sample == 0) measured = failing.alloc_index - start;
        failing.fail_index = std.math.maxInt(usize);
        if (failed) {
            failures += 1;
            try sameSave(&h, before, stats);
        }
    }
    try std.testing.expectEqual(@as(usize, samples), failures);
    std.debug.print("H5 text service OOM {d} samples / {d} allocation positions\n", .{ failures, measured });
}

fn sourceExtension(id: ?u32, add_range: bool) ![]u8 {
    var h = try Harness.init();
    defer h.deinit();
    const file = try h.save();
    defer a.free(file);
    var source = try @import("../text_source.zig").Source.open(a, file);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var records = @import("../record.zig").Iterator.init(raw, .{});
    var paragraph: usize = 0;
    var added = false;
    while (try records.next()) |record| {
        if (record.tag == 66 and record.level == 0) {
            if (paragraph == 2 and add_range) {
                try @import("../record_writer.zig").append(a, &out, 70, 1, &.{ 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0 }, 4_000_000);
                added = true;
            }
            if (paragraph == 1 and add_range) std.mem.writeInt(u16, @constCast(record.payload)[14..16], 1, .little);
            paragraph += 1;
        }
        try out.appendSlice(a, record.raw);
    }
    if (add_range) try std.testing.expect(added);
    if (id) |value| {
        var ctrl: [4]u8 = undefined;
        std.mem.writeInt(u32, &ctrl, value, .little);
        try @import("../record_writer.zig").append(a, &out, 71, 1, &ctrl, 4_000_000);
    }
    return @import("../../cfb/reader.zig").stream_replace.rebuildManyExact(a, &source.file, &.{.{ .path = "/BodyText/Section0", .content = out.items }}, .{ .max_output_bytes = 4_000_000 });
}
test "H5 text service special source purpose gates and actual default range guard" {
    for ([_]u32{ @import("../body/control_rules.zig").id("%usr"), @import("../body/control_rules.zig").id("%clk"), @import("../body/control_rules.zig").id("%fmu") }) |id| {
        const bytes = try sourceExtension(id, false);
        defer a.free(bytes);
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        session.enableHistoryDelta();
        var history = try History.initV2(a, session, .{ .max_entries = 8 });
        defer history.deinit();
        var state: State = .{};
        try state.open();
        const service: tx.Service = .{ .session = session, .history = &history, .lifetime = &state };
        try std.testing.expectError(error.UnsupportedIndependentTextPurpose, service.query(a, .{ .session = "s1", .revision = 0 }, &owners));
        try std.testing.expectEqual(@as(usize, 0), history.stats().undoCount);
    }
    const bytes = try sourceExtension(null, true);
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    var state: State = .{};
    try state.open();
    const service: tx.Service = .{ .session = session, .history = &history, .lifetime = &state };
    var q = try service.query(a, .{ .session = "s1", .revision = 0 }, &owners);
    defer q.deinit();
    const groups = groupsFor(&q);
    const stats = history.stats();
    try std.testing.expectError(error.UnsupportedRangeSemantics, service.apply(a, requestFor(&q, &groups)));
    const after = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, bytes, after.bytes);
    try std.testing.expectEqualDeep(stats, history.stats());
}
test "H5 text service query sampled OOM never issues partial snapshot or changes history" {
    var measured: usize = 0;
    var failures: usize = 0;
    const samples = 24;
    for (0..samples + 1) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var h = try Harness.initWith(fa);
        defer h.deinit();
        const before = try h.save();
        defer fa.free(before);
        const stats = h.history.stats();
        const start = failing.alloc_index;
        if (sample != 0) failing.fail_index = start + (sample - 1) * measured / @min(samples, measured);
        if (h.query(&owners)) |value| {
            var q = value;
            q.deinit();
            if (sample != 0) return error.ExpectedAllocationFailure;
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            failures += 1;
        }
        if (sample == 0) measured = failing.alloc_index - start;
        failing.fail_index = std.math.maxInt(usize);
        try sameSave(&h, before, stats);
    }
    try std.testing.expectEqual(@as(usize, samples), failures);
    std.debug.print("H5 text service query OOM {d} samples / {d} allocation positions\n", .{ failures, measured });
}

const text_policy = @import("text_source_policy.zig");
fn manySectionInput(count: usize) ![]u8 {
    var h = try Harness.init();
    defer h.deinit();
    const input = try h.save();
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const field = try @import("../docinfo/section_count.zig").locate(info, source.header.version());
    std.mem.writeInt(u16, info[field.payload_offset..][0..2], @intCast(count), .little);
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    var names: std.ArrayList([]const u8) = .empty;
    defer {
        for (names.items) |name| a.free(name);
        names.deinit(a);
    }
    for (0..count) |i| try names.append(a, try std.fmt.allocPrint(a, "Section{d}", .{i}));
    return @import("../test_section_count_fixture.zig").build(a, &source.header.raw, info, body, names.items);
}
fn openPolicyHarness(allocator: std.mem.Allocator, input: []const u8) !Harness {
    const session = try edit.Session.open(allocator, input);
    errdefer session.close();
    session.enableHistoryDelta();
    var state: State = .{};
    try state.open();
    return .{ .allocator = allocator, .session = session, .history = try History.initV2(allocator, session, .{ .max_entries = 8 }), .lifetime = state };
}
test "H5 text service policy actual original N squared versus request scoped N 2N 4N query apply" {
    for ([_]usize{ 16, 32, 64 }) |count| {
        const input = try manySectionInput(count);
        defer a.free(input);
        var h = try openPolicyHarness(a, input);
        defer h.deinit();
        const selected = try a.alloc(Owner, count);
        defer a.free(selected);
        for (selected, 0..) |*owner, i| owner.* = .{ .section = i, .paragraph = 1 };
        var baseline: text_policy.Work = .{};
        text_policy.Testing.watch(&baseline);
        {
            defer text_policy.Testing.unwatch();
            // Actual retained original Session path, same source SSOT and target
            // dry-run as pre-fix query; no mathematical full-scan substitute.
            for (selected) |owner| {
                const ctx = try h.session.prepareIndependentSourceContext(owner.section);
                defer ctx.destroy();
                const units = try h.session.editableTextLength(a, owner.section, owner.paragraph);
                try h.session.validateIndependentTextTarget(ctx, owner.section, owner.paragraph, units, &.{});
            }
        }
        try std.testing.expectEqual(count * (count - 1), baseline.policy_calls);
        try std.testing.expectEqual(count * count, baseline.scanned_slots);
        var query_work: text_policy.Work = .{};
        text_policy.Testing.watch(&query_work);
        var snapshot = block: {
            defer text_policy.Testing.unwatch();
            break :block try h.query(selected);
        };
        defer snapshot.deinit();
        try std.testing.expectEqual(count, query_work.policy_calls);
        try std.testing.expectEqual(count, query_work.scanned_slots);
        try std.testing.expectEqual(count, query_work.bound_slots);
        try std.testing.expectEqual(count, query_work.scoped_requests);
        const groups = try a.alloc(m.Group, count);
        defer a.free(groups);
        for (snapshot.rows, groups) |row, *g| g.* = .{ .ref = row.ref, .before_units = row.before_units, .edits = &.{.{ .start = 0, .end = 2, .text = "XY", .expected = "ab" }} };
        var apply_work: text_policy.Work = .{};
        text_policy.Testing.watch(&apply_work);
        const changed = block: {
            defer text_policy.Testing.unwatch();
            break :block try h.service().apply(a, requestFor(&snapshot, groups));
        };
        try std.testing.expect(changed);
        // One preflight inventory + one existing commit inventory, both counted.
        try std.testing.expectEqual(count * 2, apply_work.policy_calls);
        try std.testing.expectEqual(count, apply_work.scanned_slots);
        try std.testing.expectEqual(@as(usize, 1), h.history.stats().undoCount);
        try std.testing.expect(try h.history.undo(h.session));
        const undone = try h.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, input, undone);
        std.debug.print("H5 policy actual S={d} oldCalls={d} oldSlots={d} queryCalls={d} querySlots={d} bindSlots={d} queryBytes={d} applyCalls={d}\n", .{ count, baseline.policy_calls, baseline.scanned_slots, query_work.policy_calls, query_work.scanned_slots, query_work.bound_slots, query_work.policy_bytes, apply_work.policy_calls });
    }
}
test "H5 text service policy late target rejection still precedes history and preserves saves" {
    const input = try manySectionInput(4);
    defer a.free(input);
    var h = try openPolicyHarness(a, input);
    defer h.deinit();
    var snapshot = try h.query(&.{ .{ .section = 0, .paragraph = 1 }, .{ .section = 3, .paragraph = 1 } });
    defer snapshot.deinit();
    const groups = [_]m.Group{
        .{ .ref = snapshot.rows[0].ref, .before_units = 6, .edits = &.{.{ .start = 0, .end = 2, .text = "XY", .expected = "ab" }} },
        .{ .ref = snapshot.rows[1].ref, .before_units = 6, .edits = &.{.{ .start = 0, .end = 2, .text = "ZZ", .expected = "qq" }} },
    };
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    var work: text_policy.Work = .{};
    text_policy.Testing.watch(&work);
    {
        defer text_policy.Testing.unwatch();
        try std.testing.expectError(error.ExpectedTextMismatch, h.service().apply(a, requestFor(&snapshot, &groups)));
    }
    try std.testing.expectEqual(@as(usize, 4), work.policy_calls);
    try sameSave(&h, before, stats);
    try std.testing.expectError(error.InvalidParagraph, h.query(&.{ .{ .section = 0, .paragraph = 1 }, .{ .section = 3, .paragraph = 99 } }));
    try sameSave(&h, before, stats);
}
test "H5 text service policy context rejects foreign owner and changed live ticket" {
    const input = try twoSectionInput();
    defer a.free(input);
    var h = try openPolicyHarness(a, input);
    defer h.deinit();
    var foreign = try openPolicyHarness(a, input);
    defer foreign.deinit();
    var scope: ?*text_policy.UnselectedContext = null;
    defer if (scope) |v| v.destroy();
    const first = try h.session.prepareIndependentSourceContextScoped(0, &scope);
    defer first.destroy();
    try h.session.beginHistoryTransaction(try h.session.historyTicket());
    try std.testing.expectError(error.MutationInProgress, h.session.prepareIndependentSourceContextScoped(1, &scope));
    h.session.finishHistoryTransaction(false);
    try std.testing.expectError(error.SourceBindingMismatch, foreign.session.prepareIndependentSourceContextScoped(1, &scope));
    _ = try h.history.apply(h.session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .utf8 = "Q" } });
    try std.testing.expectError(error.SourceBindingMismatch, h.session.prepareIndependentSourceContextScoped(1, &scope));
}
test "H5 text service policy multi section sampled OOM retains exact save and history" {
    const input = try manySectionInput(4);
    defer a.free(input);
    var measured: usize = 0;
    var failures: usize = 0;
    const samples = 32;
    for (0..samples + 1) |sample| {
        var fa = std.testing.FailingAllocator.init(a, .{});
        const allocator = fa.allocator();
        var h = try openPolicyHarness(allocator, input);
        defer h.deinit();
        var q = try h.query(&.{ .{ .section = 0, .paragraph = 1 }, .{ .section = 1, .paragraph = 1 }, .{ .section = 3, .paragraph = 1 } });
        defer q.deinit();
        const groups = try allocator.alloc(m.Group, q.rows.len);
        defer allocator.free(groups);
        for (q.rows, groups) |row, *g| g.* = .{ .ref = row.ref, .before_units = row.before_units, .edits = &.{.{ .start = 0, .end = 2, .text = "XY", .expected = "ab" }} };
        const before = try h.save();
        defer allocator.free(before);
        const stats = h.history.stats();
        const start = fa.alloc_index;
        if (sample != 0) fa.fail_index = start + (sample - 1) * measured / @min(samples, measured);
        var failed = false;
        _ = h.service().apply(allocator, requestFor(&q, groups)) catch |err| block: {
            try std.testing.expectEqual(error.OutOfMemory, err);
            failed = true;
            break :block false;
        };
        if (sample == 0) measured = fa.alloc_index - start;
        fa.fail_index = std.math.maxInt(usize);
        if (failed) {
            failures += 1;
            try sameSave(&h, before, stats);
        }
    }
    try std.testing.expectEqual(@as(usize, samples), failures);
    std.debug.print("H5 multi policy OOM {d} samples / {d} allocation positions\n", .{ failures, measured });
}

test "H5 text service policy preserves selected purpose before unrelated source errors" {
    const input = try manySectionInput(3);
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const first = try source.decodeSection(a, 0);
    defer a.free(first);
    const last = try source.decodeSection(a, 2);
    defer a.free(last);
    var bad: std.ArrayList(u8) = .empty;
    defer bad.deinit(a);
    try bad.appendSlice(a, first);
    try @import("../record_writer.zig").append(a, &bad, 1000, 0, &.{}, 4_000_000);
    var formula: std.ArrayList(u8) = .empty;
    defer formula.deinit(a);
    try formula.appendSlice(a, last);
    var ctrl: [4]u8 = undefined;
    std.mem.writeInt(u32, &ctrl, @import("../body/control_rules.zig").id("%fmu"), .little);
    try @import("../record_writer.zig").append(a, &formula, 71, 1, &ctrl, 4_000_000);
    const changed = try @import("../../cfb/reader.zig").stream_replace.rebuildManyExact(a, &source.file, &.{ .{ .path = "/BodyText/Section0", .content = bad.items }, .{ .path = "/BodyText/Section2", .content = formula.items } }, .{ .max_output_bytes = 4_000_000 });
    defer a.free(changed);
    var h = try openPolicyHarness(a, changed);
    defer h.deinit();
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    var scope: ?*text_policy.UnselectedContext = null;
    defer if (scope) |v| v.destroy();
    try std.testing.expectError(error.UnsupportedIndependentTextPurpose, h.session.prepareIndependentSourceContext(2));
    try std.testing.expectError(error.UnsupportedIndependentTextPurpose, h.session.prepareIndependentSourceContextScoped(2, &scope));
    try std.testing.expect(scope == null);
    try std.testing.expectError(error.UnsupportedSectionRecord, h.session.prepareIndependentSourceContext(1));
    try std.testing.expectError(error.UnsupportedSectionRecord, h.session.prepareIndependentSourceContextScoped(1, &scope));
    try std.testing.expect(scope == null);
    var failing = std.testing.FailingAllocator.init(a, .{});
    var failed_h = try openPolicyHarness(failing.allocator(), changed);
    defer failed_h.deinit();
    failing.fail_index = failing.alloc_index;
    const raw_error = failed_h.session.prepareIndependentSourceContext(1);
    const cached_error = failed_h.session.prepareIndependentSourceContextScoped(1, &scope);
    failing.fail_index = std.math.maxInt(usize);
    try std.testing.expectError(error.UnsupportedSectionRecord, raw_error);
    try std.testing.expectError(error.UnsupportedSectionRecord, cached_error);
    try std.testing.expect(scope == null);
    try std.testing.expectError(error.UnsupportedIndependentTextPurpose, h.query(&.{.{ .section = 2, .paragraph = 1 }}));
    try std.testing.expectError(error.UnsupportedSectionRecord, h.query(&.{.{ .section = 1, .paragraph = 1 }}));
    try sameSave(&h, before, stats);
}

test "H5 H01 rich grouped other-section protection scans each section once" {
    const bytes = try twoSectionInput();
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    var state: State = .{};
    try state.open();
    const service: tx.Service = .{ .session = session, .history = &history, .lifetime = &state };
    var q = try service.query(a, .{ .session = "s1", .revision = 0 }, &.{ owners[0], owners[1], .{ .section = 1, .paragraph = 2 } });
    defer q.deinit();
    const edits = [_]m.edits.Edit{.{ .start = 0, .end = 0, .text = "Q", .expected = "" }};
    var g: [3]m.Group = undefined;
    for (q.rows, &g) |row, *group| group.* = .{ .ref = row.ref, .before_units = row.before_units, .edits = &edits, .insertion = .{ .character = .{ .text_color = 0x123456 } } };
    var work: tx.Service.Testing.Work = .{};
    try std.testing.expect(try tx.Service.Testing.applyMeasured(service, a, requestFor(&q, &g), &work));
    try std.testing.expectEqual(@as(usize, 2), work.unselected_sections);
    try std.testing.expectEqual(@as(usize, 3), work.paragraphs);
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    try std.testing.expect(try history.undo(session));
    const after = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, bytes, after);
}
