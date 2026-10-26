const std = @import("std");
const t = std.testing;
const batch = @import("line_display_snapshots.zig");
const geometry = @import("line_display_geometry_values.zig");
const single = @import("line_display_snapshot.zig");
const editor = @import("editor_session.zig");
const current = @import("display_current_paragraphs.zig");
const History = @import("editor_history.zig").History;

fn load(path: []const u8) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, t.allocator, .limited(64_000_000));
}
fn equalGeometry(expected: anytype, actual: geometry.Values) !void {
    try t.expectEqual(expected.node, actual.node);
    try t.expectEqual(expected.paragraph, actual.paragraph);
    try t.expectEqual(expected.anchor_node, actual.anchor_node);
    try t.expectEqual(expected.anchor_unit, actual.anchor_unit);
    try t.expectEqualDeep(expected.endpoints, actual.endpoints);
}
fn compare(a: std.mem.Allocator, session: *const editor.Session, section: usize, report: *const batch.Report) !void {
    for (report.entries) |entry| {
        const expected = single.readGeometry(a, session, section, entry.node) catch |err| {
            try t.expectEqual(err, entry.result.unavailable);
            try t.expectError(err, single.read(a, session, section, entry.node));
            continue;
        };
        const value = entry.result.value;
        try equalGeometry(expected, value.geometry);
        const full = single.read(a, session, section, entry.node) catch |err| {
            try t.expectEqual(err, value.paint.unavailable);
            continue;
        };
        try equalGeometry(full, value.geometry);
        try t.expectEqualDeep(full.stroke, value.paint.value);
    }
}
fn nodes(a: std.mem.Allocator, session: *const editor.Session, section: usize) ![]usize {
    const raw = try single.nodes(a, session, section);
    defer a.free(raw);
    const result = try a.alloc(usize, raw.len);
    for (raw, result) |node, *target| target.* = node;
    return result;
}

test "line display batch actual handbook section2 geometry18 paint17 refusals single equivalence" {
    const bytes = try load("reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx");
    defer t.allocator.free(bytes);
    var session = try editor.open(t.allocator, bytes, .{});
    defer session.deinit();
    const indices = try nodes(t.allocator, &session, 2);
    defer t.allocator.free(indices);
    try t.expectEqual(@as(usize, 18), indices.len);
    const before = try session.save();
    defer t.allocator.free(before);
    var report = try batch.read(t.allocator, &session, 2, indices);
    defer report.deinit(t.allocator);
    try compare(t.allocator, &session, 2, &report);
    var refused: usize = 0;
    for (report.entries, indices) |entry, node| {
        try t.expectEqual(node, entry.node);
        const value = entry.result.value;
        switch (value.paint) {
            .value => {},
            .unavailable => |err| {
                try t.expectEqual(error.UnsupportedLineStrokeDecoration, err);
                refused += 1;
            },
        }
    }
    try t.expectEqual(@as(usize, 17), refused);
    const after = try session.save();
    defer t.allocator.free(after);
    try t.expectEqualSlices(u8, before, after);
    try t.expectEqualSlices(u8, bytes, session.source);
    std.debug.print("handbook section=2: geometry=18, paint refused=17, paint accepted=1; single equivalence OK\n", .{});
}

const rendering = "<p:renderingInfo><c:transMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/><c:rotMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo>";
const endpoints = "<c:startPt x='1' y='2'/><c:endPt x='3' y='4'/>" ++ rendering;
const mixed_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p id='1'><p:run><p:t>A</p:t>" ++
    "<p:line>" ++ endpoints ++ "<p:lineShape style='DASH' width='10' color='#123456'/></p:line>" ++
    "<p:line>" ++ endpoints ++ "<p:lineShape headStyle='ARROW'/></p:line>" ++
    "<p:line>" ++ rendering ++ "<p:lineShape headStyle='ARROW'/></p:line>" ++
    "<p:line>" ++ endpoints ++ "<p:lineShape color='invalid'/></p:line>" ++
    "</p:run></p:p></s:sec>";

fn mixedProbe(a: std.mem.Allocator, session: *const editor.Session, indices: []const usize) !void {
    const request = [_]usize{ indices[0], indices[1], 0, indices[2], indices[3], std.math.maxInt(usize), indices[0] };
    var report = try batch.read(a, session, 0, &request);
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 7), report.entries.len);
    for (report.entries, request) |entry, node| try t.expectEqual(node, entry.node);
    try t.expect(report.entries[1].result == .value);
    try t.expect(report.entries[1].result.value.paint == .unavailable);
    try t.expect(report.entries[4].result == .value);
    try t.expect(report.entries[4].result.value.paint == .unavailable);
    try t.expectEqual(@as(?u32, 0x123456), report.entries[0].result.value.paint.value.color);
    try t.expectEqual(error.UnsupportedLineStrokeDecoration, report.entries[1].result.value.paint.unavailable);
    try t.expectEqual(error.InvalidLineGeometryNode, report.entries[2].result.unavailable);
    try t.expectEqual(error.IncompleteLineEndpoints, report.entries[3].result.unavailable);
    try t.expectEqual(error.UnsupportedLineStrokeColor, report.entries[4].result.value.paint.unavailable);
    try t.expectEqual(error.InvalidLineGeometryNode, report.entries[5].result.unavailable);
    try t.expectEqualDeep(report.entries[0], report.entries[6]);
    try t.expectEqualDeep(@import("line_rendering_endpoints.zig").Endpoints{ .{ 1, 2 }, .{ 3, 4 } }, report.entries[1].result.value.geometry.endpoints);
}

test "line display batch mixed geometry paint errors and every allocation failure" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(t.allocator, mixed_xml);
    defer t.allocator.free(bytes);
    var session = try editor.open(t.allocator, bytes, .{});
    defer session.deinit();
    const indices = try nodes(t.allocator, &session, 0);
    defer t.allocator.free(indices);
    try t.expectEqual(@as(usize, 4), indices.len);
    const before = try session.save();
    defer t.allocator.free(before);
    try @import("../testing/allocation_failures.zig").check(mixedProbe, .{ &session, indices });
    const request = [_]usize{ indices[1], 0, indices[2], indices[3], indices[0] };
    var report = try batch.read(t.allocator, &session, 0, &request);
    defer report.deinit(t.allocator);
    try compare(t.allocator, &session, 0, &report);
    const after = try session.save();
    defer t.allocator.free(after);
    try t.expectEqualSlices(u8, before, after);
    try t.expectEqualSlices(u8, bytes, session.source);
    // Geometry owns only numbers, even after the temporary view has gone away.
    var view = try current.read(t.allocator, &session.sections[0], session.options);
    const detached = geometry.readWithView(t.allocator, &session.sections[0], &view, indices[0]) catch |err| {
        view.deinit(t.allocator);
        return err;
    };
    view.deinit(t.allocator);
    try equalGeometry(report.entries[4].result.value.geometry, detached);
}

fn stateProbe(a: std.mem.Allocator, session: *const editor.Session, indices: []const usize, ordinal: usize, unit: usize) !void {
    const request = [_]usize{ indices[0], std.math.maxInt(usize), indices[1], indices[1] };
    var report = try batch.read(a, session, 0, &request);
    defer report.deinit(a);
    try t.expectEqual(error.InvalidLineGeometryNode, report.entries[1].result.unavailable);
    const value = report.entries[2].result.value.geometry;
    try t.expectEqual(ordinal, value.paragraph);
    try t.expectEqual(unit, value.anchor_unit);
    try t.expectEqualDeep(report.entries[2], report.entries[3]);
}

fn assertState(session: *const editor.Session, history: *const History, indices: []const usize, ordinal: usize, unit: usize, sweep: bool) !void {
    const a = t.allocator;
    const before = try session.save();
    defer a.free(before);
    const revision = history.stack.revision;
    const next_revision = history.stack.next_revision;
    const undo_count = history.stack.undo.items.len;
    const redo_count = history.stack.redo.items.len;
    const section = &session.sections[0];
    const sites = section.sites.items.ptr;
    const structure = if (section.structure_values) |values| values.paragraphs.ptr else null;
    const dirty = try a.dupe(@import("text_sites_save.zig").FieldDirty, section.field_dirty.items);
    defer a.free(dirty);
    try stateProbe(a, session, indices, ordinal, unit);
    if (sweep) try @import("../testing/allocation_failures.zig").check(stateProbe, .{ session, indices, ordinal, unit });
    const detached: batch.Value = blk: {
        var report = try batch.read(a, session, 0, indices);
        defer report.deinit(a);
        try compare(a, session, 0, &report);
        break :blk report.entries[1].result.value;
    };
    // The result storage has already been freed: copies own only scalar values,
    // and freeing projections must not release or modify the current model.
    try equalGeometry(try single.readGeometry(a, session, 0, indices[1]), detached.geometry);
    const after = try session.save();
    defer a.free(after);
    try t.expectEqualSlices(u8, before, after);
    try t.expectEqual(revision, history.stack.revision);
    try t.expectEqual(next_revision, history.stack.next_revision);
    try t.expectEqual(undo_count, history.stack.undo.items.len);
    try t.expectEqual(redo_count, history.stack.redo.items.len);
    try t.expectEqual(sites, section.sites.items.ptr);
    try t.expectEqual(structure, if (section.structure_values) |values| values.paragraphs.ptr else null);
    try t.expectEqualDeep(dirty, section.field_dirty.items);
}

test "line display batch current text split merge undo redo and failure queries preserve history" {
    const bytes = try load("legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx");
    defer t.allocator.free(bytes);
    var session = try editor.open(t.allocator, bytes, .{});
    defer session.deinit();
    const indices = try nodes(t.allocator, &session, 0);
    defer t.allocator.free(indices);
    try t.expectEqual(@as(usize, 2), indices.len);
    var history = try History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try assertState(&session, &history, indices, 1, 1, true);
    // Non-structural current text must also affect the anchor, with history off.
    try t.expect(try session.spliceAnchored(0, 1, 0, 0, "앞😀"));
    try assertState(&session, &history, indices, 1, 4, false);
    try t.expect(try history.apply(&session, .{ .kind = .split_anchored, .paragraph = 1, .start = 4, .deleted = 0, .inserted = "" }));
    try assertState(&session, &history, indices, 2, 0, false);
    try t.expect(try history.apply(&session, .{ .kind = .anchored, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "앞😀" }));
    try assertState(&session, &history, indices, 2, 3, true);
    try t.expect(try history.apply(&session, .{ .kind = .merge, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" }));
    try assertState(&session, &history, indices, 1, 7, false);
    try t.expect(try history.undo(&session));
    try assertState(&session, &history, indices, 2, 3, true);
    try t.expect(try history.redo(&session));
    try assertState(&session, &history, indices, 1, 7, false);
    try t.expectEqualSlices(u8, bytes, session.source);
}

test "line display batch empty invalid section shared view error and detached session lifetime" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(t.allocator, mixed_xml);
    defer t.allocator.free(bytes);
    var session = try editor.open(t.allocator, bytes, .{});
    var alive = true;
    defer if (alive) session.deinit();
    const indices = try nodes(t.allocator, &session, 0);
    defer t.allocator.free(indices);
    try t.expectError(error.InvalidSectionIndex, batch.read(t.allocator, &session, 1, indices));
    try t.expectError(error.InvalidSectionIndex, batch.read(t.allocator, &session, 1, &.{}));
    var sections = [_]editor.Section{session.sections[0]};
    sections[0].first_paragraph = 0;
    sections[0].source_first_paragraph = 0;
    var invalid_view = session;
    invalid_view.sections = &sections;
    // A failing allocator proves an empty request neither constructs the view
    // nor allocates output storage. Section validation must still happen first.
    var failing = std.testing.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    try t.expectError(error.InvalidSectionIndex, batch.read(failing.allocator(), &invalid_view, 1, &.{std.math.maxInt(usize)}));
    try t.expectError(error.InvalidSectionIndex, single.readGeometry(t.allocator, &invalid_view, 1, std.math.maxInt(usize)));
    var empty = try batch.read(failing.allocator(), &invalid_view, 0, &.{});
    defer empty.deinit(failing.allocator());
    try t.expectEqual(@as(usize, 0), empty.entries.len);
    var refused = try batch.read(t.allocator, &invalid_view, 0, &.{ indices[0], std.math.maxInt(usize) });
    defer refused.deinit(t.allocator);
    try compare(t.allocator, &invalid_view, 0, &refused);
    for (refused.entries) |entry| try t.expectEqual(error.SourceBindingMismatch, entry.result.unavailable);
    // The same invalid node yields a node error with a healthy view, but either
    // view failure wins first, exactly as in the frozen single implementation.
    try t.expectError(error.InvalidLineGeometryNode, single.readGeometry(t.allocator, &session, 0, std.math.maxInt(usize)));
    sections[0] = session.sections[0];
    try t.expect(sections[0].sites.items.len != 0);
    sections[0].structure_values = .{ .paragraphs = &.{} };
    {
        var duplicate_owner = try batch.read(t.allocator, &invalid_view, 0, &.{ indices[0], std.math.maxInt(usize) });
        defer duplicate_owner.deinit(t.allocator);
        try compare(t.allocator, &invalid_view, 0, &duplicate_owner);
        for (duplicate_owner.entries) |entry| try t.expectEqual(error.DuplicateCurrentTextOwner, entry.result.unavailable);
    }
    var owned = try batch.read(t.allocator, &session, 0, indices);
    defer owned.deinit(t.allocator);
    const before = try std.json.Stringify.valueAlloc(t.allocator, owned, .{});
    defer t.allocator.free(before);
    session.deinit();
    alive = false;
    const after = try std.json.Stringify.valueAlloc(t.allocator, owned, .{});
    defer t.allocator.free(after);
    try t.expectEqualStrings(before, after);
}
