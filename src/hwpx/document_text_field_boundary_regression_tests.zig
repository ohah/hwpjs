//! Supplemental tests only. The r18 source and its existing tests stay immutable.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const analysis = @import("source_field_analysis.zig");
const snapshot = @import("document_text_snapshot.zig");
const xml = @import("document_xml.zig");
const a = std.testing.allocator;
const fixture = @embedFile("test_fixtures/document_text_field_boundary_regression.xml");
const stamp: @import("../model/document_text_read_binding.zig").Stamp = .{ .epoch = 7, .serial = 13 };

// Heap ownership keeps Session/History pointers stable throughout the test.
const Harness = struct {
    session: editor.Session,
    history: histories.History,
    lifetime: @import("../model/formatting_binding.zig").State = .{ .epoch = 7, .opened = true },
    name: []u8,

    fn create(max_text_bytes: ?usize) !*Harness {
        const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, fixture);
        defer a.free(bytes);
        var options: editor.Options = .{};
        if (max_text_bytes) |limit| options.max_text_bytes = limit;
        return createWithOptions(bytes, options);
    }

    fn createWithOptions(bytes: []const u8, options: editor.Options) !*Harness {
        const self = try a.create(Harness);
        errdefer a.destroy(self);
        self.* = .{ .session = try editor.open(a, bytes, options), .history = undefined, .name = undefined };
        errdefer self.session.deinit();
        self.session.history_delta_managed = true;
        self.history = try histories.History.initV2(&self.session, .{ .max_entries = 8 });
        errdefer self.history.deinit();
        self.name = try self.lifetime.session(a);
        return self;
    }

    fn deinit(self: *Harness) void {
        a.free(self.name);
        self.history.deinit();
        self.session.deinit();
        a.destroy(self);
    }

    fn apply(self: *Harness, query: []const u8, replacement: []const u8) !bool {
        const service: @import("document_replace_all.zig").Service = .{
            .session = &self.session,
            .history = &self.history,
            .lifetime = &self.lifetime,
        };
        return service.apply(a, .{
            .binding = .{ .session = self.name, .revision = self.history.revision() },
            .query = query,
            .replacement = replacement,
        });
    }
};

fn expectRows(session: *editor.Session, lifetime: @import("../model/formatting_binding.zig").State, revision: ?u32, left: []const u8, right: []const u8) !void {
    var observed = try snapshot.observe(a, session, lifetime, revision);
    defer observed.deinit();
    try observed.assertCurrent(session);
    const body = try std.fmt.allocPrint(a, "{s}LABEL_NEEDLE{s}", .{ left, right });
    defer a.free(body);
    const expected = [_][]const u8{ body, "BEGIN_NEEDLE", "END_NEEDLE", "KEEP" };
    try std.testing.expectEqual(@as(usize, expected.len), observed.snapshot.rows.items.len);
    for (expected) |text| {
        var count: usize = 0;
        for (observed.snapshot.rows.items) |row| {
            try std.testing.expect(row.source == .paragraph);
            try std.testing.expect(std.mem.indexOf(u8, row.text, "DECOY") == null);
            if (std.mem.eql(u8, row.text, text)) count += 1;
        }
        try std.testing.expectEqual(@as(usize, 1), count);
    }
}

// These checks precede every admission assertion. An early parser/read/selection
// refusal is a failing precondition, never evidence of ProtectedFieldRange.
fn preconditions(h: *Harness) !void {
    std.debug.print("FIELD_BOUNDARY stage=preconditions-start\n", .{});
    try @import("test_expect_owned_error.zig").expect(a, error.InvalidFieldLinks, analysis.leaseForExterior(&h.session));
    var selected = try analysis.selectedForExterior(&h.session);
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), selected.fields.len);
    try std.testing.expectEqual(@as(usize, 0), selected.report.duplicate_begin_ids);
    try std.testing.expectEqual(@as(usize, 0), selected.report.unmatched_begins);
    try std.testing.expectEqual(@as(usize, 0), selected.report.unresolved_ends);
    try expectRows(&h.session, h.lifetime, h.history.revision(), "LEFT_NEEDLE", "RIGHT_NEEDLE");

    const tree = &h.session.sections[0].tree;
    const field = selected.fields[0];
    const begin = selected.report.markers[field.begin_marker].element_index;
    const end = selected.report.markers[field.end_marker].element_index;
    // Verify physical ancestors against the selected markers, not XML ids.
    for ([_][]const u8{ "BEGIN_NEEDLE", "END_NEEDLE" }, [_]usize{ begin, end }) |text, owner| {
        var count: usize = 0;
        for (h.session.sections[0].sites.items) |site| {
            if (!std.mem.eql(u8, site.text, text)) continue;
            var node: ?usize = site.element_index;
            var actual: ?usize = null;
            while (node) |at| {
                if (tree.elements[at].is(xml.paragraph_uri, "fieldBegin") or tree.elements[at].is(xml.paragraph_uri, "fieldEnd")) {
                    actual = at;
                    break;
                }
                node = tree.elements[at].parent;
            }
            try std.testing.expectEqual(owner, actual orelse return error.MissingPhysicalMarkerOwner);
            count += 1;
        }
        try std.testing.expectEqual(@as(usize, 1), count);
    }
    // Immediate neighboring text sites share the marker controls' run. Prove
    // their physical order and the literal no-text-gap XML fixture separately.
    const begin_ctrl = tree.elements[begin].parent orelse return error.MissingBeginControl;
    const end_ctrl = tree.elements[end].parent orelse return error.MissingEndControl;
    const run = tree.elements[begin_ctrl].parent orelse return error.MissingMarkerRun;
    try std.testing.expectEqual(run, tree.elements[end_ctrl].parent.?);
    try std.testing.expect(begin < end);
    for ([_][]const u8{ "LEFT_NEEDLE", "RIGHT_NEEDLE" }, 0..) |text, side| {
        var count: usize = 0;
        for (h.session.sections[0].sites.items) |site| {
            if (!std.mem.eql(u8, site.text, text)) continue;
            try std.testing.expectEqual(run, tree.elements[site.element_index].parent.?);
            try std.testing.expect(if (side == 0) site.element_index < begin_ctrl else site.element_index > end_ctrl);
            count += 1;
        }
        try std.testing.expectEqual(@as(usize, 1), count);
    }

    // Resolve actual current Native selections on both neighbors, the label and
    // both metadata rows. Read selection is not edit authority.
    var observed = try snapshot.observe(a, &h.session, h.lifetime, h.history.revision());
    defer observed.deinit();
    try observed.snapshot.bindReadStamp(stamp);
    for ([_][]const u8{ "LEFT_NEEDLE", "RIGHT_NEEDLE", "LABEL_NEEDLE", "BEGIN_NEEDLE", "END_NEEDLE" }) |needle| {
        var count: usize = 0;
        for (observed.snapshot.rows.items) |row| {
            const start = std.mem.indexOf(u8, row.text, needle) orelse continue;
            var selection = try @import("document_text_selection.zig").query(a, &h.session, h.lifetime, h.history.revision(), .{
                .binding = observed.snapshot.binding,
                .read_stamp = stamp,
                .ref = row.ref,
                .start = @intCast(start),
                .end = @intCast(start + needle.len),
                .expected = needle,
            });
            defer selection.deinit();
            try std.testing.expect(selection.target == .paragraph);
            try std.testing.expectEqualStrings(row.text, selection.before_text);
            count += 1;
        }
        try std.testing.expectEqual(@as(usize, 1), count);
    }
    std.debug.print("FIELD_BOUNDARY stage=preconditions-complete\n", .{});
}

fn expectSaved(session: *editor.Session, expected: []const u8) !void {
    const actual = try session.save();
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
}

fn expectReopened(h: *Harness, saved: []const u8, left: []const u8, right: []const u8) !void {
    var fresh = try editor.open(a, saved, h.session.options);
    defer fresh.deinit();
    try expectRows(&fresh, h.lifetime, null, left, right);
    try expectSaved(&fresh, saved);
    // Both entire marker subtrees must retain their original XML bytes.
    var original_fields = try analysis.selectedForExterior(&h.session);
    defer original_fields.deinit(a);
    var reopened_fields = try analysis.selectedForExterior(&fresh);
    defer reopened_fields.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), reopened_fields.fields.len);
    const old = original_fields.fields[0];
    const new = reopened_fields.fields[0];
    for ([_]usize{ old.begin_marker, old.end_marker }, [_]usize{ new.begin_marker, new.end_marker }) |before_index, after_index| {
        const before_node = original_fields.report.markers[before_index].element_index;
        const after_node = reopened_fields.report.markers[after_index].element_index;
        try std.testing.expectEqualSlices(u8, h.session.sections[0].tree.sourceOf(before_node), fresh.sections[0].tree.sourceOf(after_node));
    }
}

fn exterior(side: enum { left, right }) !void {
    const h = try Harness.create(null);
    defer h.deinit();
    try preconditions(h);
    const before = try h.session.save();
    defer a.free(before);
    const revision = h.history.revision();
    const serial = h.session.mutation_serial;
    const query = if (side == .left) "LEFT_NEEDLE" else "RIGHT_NEEDLE";
    const replacement = if (side == .left) "LEFT_OK😀" else "RIGHT_OK😀";
    try std.testing.expect(try h.apply(query, replacement));
    try std.testing.expect(h.history.revision() != revision);
    try std.testing.expect(h.session.mutation_serial > serial);
    try std.testing.expectEqual(@as(usize, 1), h.history.stats().undoCount);
    try std.testing.expectEqual(@as(usize, 0), h.history.stats().redoCount);
    const left = if (side == .left) replacement else "LEFT_NEEDLE";
    const right = if (side == .right) replacement else "RIGHT_NEEDLE";
    try expectRows(&h.session, h.lifetime, h.history.revision(), left, right);
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expect(!std.mem.eql(u8, before, after));
    try expectReopened(h, after, left, right);
    try std.testing.expect(try h.history.undo(&h.session));
    try expectSaved(&h.session, before);
    try expectRows(&h.session, h.lifetime, h.history.revision(), "LEFT_NEEDLE", "RIGHT_NEEDLE");
    try std.testing.expect(try h.history.redo(&h.session));
    try expectSaved(&h.session, after);
    try expectReopened(h, after, left, right);
}

// A real successful Service edit followed by undo supplies a nonempty redo.
fn seedRedo(h: *Harness) ![]u8 {
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expect(try h.apply("RIGHT_NEEDLE", "RIGHT_CHANGE"));
    try expectRows(&h.session, h.lifetime, h.history.revision(), "LEFT_NEEDLE", "RIGHT_CHANGE");
    const saved = try h.session.save();
    errdefer a.free(saved);
    try std.testing.expect(try h.history.undo(&h.session));
    try expectSaved(&h.session, before);
    try std.testing.expectEqual(@as(usize, 1), h.history.stats().redoCount);
    return saved;
}

fn rejectAtomically(h: *Harness, query: []const u8, replacement: []const u8, expected_error: anyerror) !void {
    try rejectPreservingState(h, query, replacement, expected_error);
    try expectRows(&h.session, h.lifetime, h.history.revision(), "LEFT_NEEDLE", "RIGHT_NEEDLE");
}

// Also usable when the explicitly configured read cap denies observation.
fn rejectPreservingState(h: *Harness, query: []const u8, replacement: []const u8, expected_error: anyerror) !void {
    const before = try h.session.save();
    defer a.free(before);
    const stats = h.history.stats();
    const serial = h.session.mutation_serial;
    const count = h.history.revisionCount();
    const revisions = try a.alloc(?u32, count);
    defer a.free(revisions);
    for (revisions, 0..) |*revision, i| revision.* = h.history.revisionAt(i);
    try std.testing.expectEqual(@as(usize, 1), stats.redoCount);
    var rejected: ?anyerror = null;
    const changed = h.apply(query, replacement) catch |err| result: {
        rejected = err;
        break :result false;
    };
    const after = try h.session.save();
    defer a.free(after);
    std.debug.print("FIELD_BOUNDARY query={s} error={s} changed={} same_bytes={} same_serial={} same_revision={} redo_before={d} redo_after={d}\n", .{
        query,                          if (rejected) |err| @errorName(err) else "none", changed,
        std.mem.eql(u8, before, after), serial == h.session.mutation_serial,             stats.revision == h.history.revision(),
        stats.redoCount,                h.history.stats().redoCount,
    });
    try std.testing.expect(rejected != null);
    try std.testing.expectEqual(expected_error, rejected.?);
    try std.testing.expect(!changed);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(serial, h.session.mutation_serial);
    try std.testing.expectEqualDeep(stats, h.history.stats());
    try std.testing.expectEqual(count, h.history.revisionCount());
    for (revisions, 0..) |revision, i| try std.testing.expectEqual(revision, h.history.revisionAt(i));
}

fn replayExistingRedo(h: *Harness, expected: []const u8) !void {
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expect(try h.history.redo(&h.session));
    try expectSaved(&h.session, expected);
    try expectReopened(h, expected, "LEFT_NEEDLE", "RIGHT_CHANGE");
    try std.testing.expect(try h.history.undo(&h.session));
    try expectSaved(&h.session, before);
}

test "field boundary regression end marker descendant refuses after actual read and selection" {
    const h = try Harness.create(null);
    defer h.deinit();
    try preconditions(h);
    const redo = try seedRedo(h);
    defer a.free(redo);
    try rejectAtomically(h, "END_NEEDLE", "UNAUTHORIZED", error.ProtectedFieldRange);
    try replayExistingRedo(h, redo);
}

test "field boundary regression immediately before begin supports history save and fresh reopen" {
    try exterior(.left);
}

test "field boundary regression immediately after end supports history save and fresh reopen" {
    try exterior(.right);
}

test "field boundary regression mixed internal and external matches preserve existing redo and bytes" {
    const h = try Harness.create(null);
    defer h.deinit();
    try preconditions(h);
    const redo = try seedRedo(h);
    defer a.free(redo);
    var observed = try snapshot.observe(a, &h.session, h.lifetime, h.history.revision());
    defer observed.deinit();
    var plan = try @import("../model/document_replace_all.zig").prepare(a, &observed.snapshot, .{
        .binding = .{ .session = h.name, .revision = h.history.revision() },
        .query = "NEEDLE",
        .replacement = "CHANGED",
    });
    defer plan.deinit();
    // Three body matches plus one beneath each marker; no protected match omitted.
    try std.testing.expectEqual(@as(u32, 5), plan.match_count);
    try std.testing.expectEqual(@as(usize, 3), plan.groups.len);
    try rejectAtomically(h, "NEEDLE", "CHANGED", error.ProtectedFieldRange);
    try replayExistingRedo(h, redo);
}

test "field boundary regression max_text_bytes exact edge and one byte over preserve existing redo" {
    const baseline = try Harness.create(null);
    defer baseline.deinit();
    try preconditions(baseline);
    var input_bytes: usize = 0;
    for (baseline.session.sections) |section| input_bytes += try section.textBytes(baseline.session.options.max_text_bytes - input_bytes);
    const limit = input_bytes + 1;
    const h = try Harness.create(limit);
    defer h.deinit();
    try preconditions(h);
    const redo = try seedRedo(h); // Same UTF-8 byte length; budget unchanged.
    defer a.free(redo);
    std.debug.print("FIELD_BOUNDARY input_text_bytes={d} max_text_bytes={d} reject_output_bytes={d} exact_output_bytes={d}\n", .{ input_bytes, limit, input_bytes + 2, input_bytes + 1 });
    try rejectAtomically(h, "LEFT_NEEDLE", "LEFT_NEEDLE!!", error.LimitExceeded);
    try replayExistingRedo(h, redo);
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expect(try h.apply("LEFT_NEEDLE", "LEFT_NEEDLE!"));
    try std.testing.expectEqual(@as(usize, 0), h.history.stats().redoCount);
    var actual_bytes: usize = 0;
    for (h.session.sections) |section| actual_bytes += try section.textBytes(limit - actual_bytes);
    try std.testing.expectEqual(limit, actual_bytes);
    try std.testing.expectEqual(@as(usize, 1), h.session.sections.len);
    try std.testing.expectEqual(try std.math.mul(usize, limit, 2), try retained(h));
    const after = try h.session.save();
    defer a.free(after);
    try expectReopened(h, after, "LEFT_NEEDLE!", "RIGHT_NEEDLE");
    try std.testing.expect(try h.history.undo(&h.session));
    try expectSaved(&h.session, before);
    try std.testing.expect(try h.history.redo(&h.session));
    try expectSaved(&h.session, after);
    try expectReopened(h, after, "LEFT_NEEDLE!", "RIGHT_NEEDLE");
}

// Measure the actual kernel allocations on this unmodified single section.
fn retained(h: *Harness) !usize {
    try std.testing.expectEqual(@as(usize, 1), h.session.sections.len);
    var physical = try @import("display_current_paragraphs.zig").read(a, &h.session.sections[0], h.session.options);
    defer physical.deinit(a);
    var context = try @import("control_text_read_context.zig").Context.init(a, &h.session.sections[0].tree, physical.paragraphs, try @import("document_text_read_options.zig").fromSession(h.session.options));
    defer context.deinit();
    var bytes: usize = 0;
    for (context.rows) |row| {
        try std.testing.expect(row.coverage == .complete);
        bytes = try std.math.add(usize, bytes, row.plain.len);
        bytes = try std.math.add(usize, bytes, (row.text orelse return error.MissingVisibleRead).len);
    }
    return bytes;
}

test "field retained policy input cap exact and one below atomically preserves valid prior redo" {
    const h = try Harness.create(null);
    defer h.deinit();
    try preconditions(h);
    const bytes = try retained(h);
    try std.testing.expect(bytes > 0);
    h.session.options.max_read_retained_bytes = bytes;
    try preconditions(h); // Exact retained cap admits the complete read.
    const redo = try seedRedo(h);
    defer a.free(redo);
    h.session.options.max_read_retained_bytes = bytes - 1;
    if (snapshot.observe(a, &h.session, h.lifetime, h.history.revision())) |value| {
        var unexpected = value;
        defer unexpected.deinit();
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(error.LimitExceeded, err);
    try rejectPreservingState(h, "LEFT_NEEDLE", "LEFT_NEEDLE!", error.LimitExceeded);
    try std.testing.expectEqual(bytes - 1, h.session.options.max_read_retained_bytes.?);
    h.session.options.max_read_retained_bytes = bytes;
    try replayExistingRedo(h, redo);
    try expectRows(&h.session, h.lifetime, h.history.revision(), "LEFT_NEEDLE", "RIGHT_NEEDLE");
}

test "field retained policy prepared output cap exact and one byte over preserves valid prior redo" {
    const h = try Harness.create(null);
    defer h.deinit();
    const input = try retained(h);
    const output = try std.math.add(usize, input, 2); // One added plain and visible byte.
    const semantic = try h.session.sections[0].textBytes(h.session.options.max_text_bytes);
    h.session.options.max_text_bytes = semantic + 1;
    h.session.options.max_read_retained_bytes = output - 1;
    try preconditions(h); // Input fits, candidate's verifyAfter must refuse.
    const redo = try seedRedo(h);
    defer a.free(redo);
    try rejectAtomically(h, "LEFT_NEEDLE", "LEFT_NEEDLE!", error.LimitExceeded);
    try std.testing.expectEqual(output - 1, h.session.options.max_read_retained_bytes.?);
    try replayExistingRedo(h, redo);
    h.session.options.max_read_retained_bytes = output;
    const before = try h.session.save();
    defer a.free(before);
    try std.testing.expect(try h.apply("LEFT_NEEDLE", "LEFT_NEEDLE!"));
    try std.testing.expectEqual(output, try retained(h));
    try std.testing.expectEqual(@as(usize, 0), h.history.stats().redoCount);
    const after = try h.session.save();
    defer a.free(after);
    try expectReopened(h, after, "LEFT_NEEDLE!", "RIGHT_NEEDLE");
    try std.testing.expect(try h.history.undo(&h.session));
    try expectSaved(&h.session, before);
    try std.testing.expect(try h.history.redo(&h.session));
    try expectSaved(&h.session, after);
    try expectReopened(h, after, "LEFT_NEEDLE!", "RIGHT_NEEDLE");
}
