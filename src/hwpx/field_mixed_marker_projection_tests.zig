//! 공개 split에서 도달한 혼합 marker 모델의 성공 회귀와 변조 거부 후보입니다.
const std = @import("std");
const Editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const Tree = @import("xml_part_tree.zig").Tree;
const Spans = @import("field_current_spans.zig");
const Selector = @import("field_current_exterior_insertion_site.zig");
const a = std.testing.allocator;
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:fieldBegin id='7' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>";
fn open() !Editor.Session {
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    return Editor.open(a, input, .{});
}
fn split() !Editor.Session {
    var s = try open();
    errdefer s.deinit();
    try std.testing.expect(try s.splitParagraph(0, 2, 0, 0));
    return s;
}
fn choose(allocator: std.mem.Allocator, s: *const Editor.Session) !usize {
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(allocator, &trees, .{});
    defer report.deinit();
    return Selector.select(allocator, &trees, 0, &s.sections[0].structure_values.?, 2, &report, 1, 1, Editor.siteOptions(s.options), 200000);
}
fn assertState(s: *Editor.Session, tail: []const u8) !void {
    const first = try @import("field_label_display_text.zig").read(s, 0, 1);
    defer a.free(first);
    try std.testing.expectEqualStrings("A", first);
    const last = try @import("field_label_display_text.zig").read(s, 0, 3);
    defer a.free(last);
    const expected = try std.mem.concat(a, u8, &.{ "B", tail });
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, last);
    const values = &s.sections[0].structure_values.?;
    try std.testing.expect(values.paragraphs[0].field_positions == null);
    var ends: usize = 0;
    for (values.paragraphs[2].field_positions.?) |marker| if (marker.kind == .end) {
        ends += 1;
        try std.testing.expectEqual(@as(usize, 1), marker.unit);
    };
    try std.testing.expectEqual(@as(usize, 1), ends);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}
fn exportZip(label: []const u8, bytes: []const u8) !void {
    // 독립 Python 검증을 요청한 probe 실행에서만 로그로 내보냅니다. 파일은 쓰지 않습니다.
    if (std.process.Environ.getPosix(std.testing.environ, "HWPJS_MIXED_PROJECTION_EXPORT") == null) return;
    const codec = std.base64.standard.Encoder;
    const encoded = try a.alloc(u8, codec.calcSize(bytes.len));
    defer a.free(encoded);
    _ = codec.encode(encoded, bytes);
    std.debug.print("MIXED_PROJECTION_ZIP {s} {s}\n", .{ label, encoded });
}

test "mixed marker projection positive public split query splice history and reopen" {
    var s = try open();
    defer s.deinit();
    const source = try s.save();
    defer a.free(source);
    var history = try History.init(&s, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&s, .{ .kind = .split, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    try assertState(&s, "Z");
    const before = try s.save();
    defer a.free(before);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&s, 0, 3, 1, 2));
    try std.testing.expectEqual(@as(usize, 1), try choose(a, &s));
    try std.testing.expect(try history.apply(&s, .{ .paragraph = 3, .start = 1, .deleted = 1, .inserted = "Y" }));
    try assertState(&s, "Y");
    const after = try s.save();
    defer a.free(after);
    var reopened = try Editor.open(a, after, .{});
    defer reopened.deinit();
    const text = try @import("field_label_display_text.zig").read(&reopened, 0, 3);
    defer a.free(text);
    try std.testing.expectEqualStrings("BY", text);
    try std.testing.expect(try history.undo(&s));
    try assertState(&s, "Z");
    const undone = try s.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&s));
    try assertState(&s, "Y");
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
    try std.testing.expect(try history.apply(&s, .{ .paragraph = 3, .start = 1, .deleted = 1, .inserted = "한😀" }));
    try assertState(&s, "한😀");
    try std.testing.expect(try history.undo(&s));
    try assertState(&s, "Y");
    try std.testing.expect(try history.undo(&s));
    try assertState(&s, "Z");
    try std.testing.expect(try history.undo(&s));
    const original_again = try s.save();
    defer a.free(original_again);
    try std.testing.expectEqualSlices(u8, source, original_again);
    try std.testing.expectEqualSlices(u8, source, s.source);
    try std.testing.expect(try history.redo(&s));
    try assertState(&s, "Z");
    try std.testing.expect(try history.redo(&s));
    try assertState(&s, "Y");
    try exportZip("source", source);
    try exportZip("before", before);
    try exportZip("after", after);
}

test "mixed marker projection shared inherited identity and current units" {
    var s = try split();
    defer s.deinit();
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    var projection = try Spans.projectForExterior(a, &trees, 0, &s.sections[0].structure_values.?, 2, &report, Editor.siteOptions(s.options), 200000);
    defer projection.deinit(a);
    const begin = projection.points.get(report.markers[0].element_index) orelse return error.MissingProjectedBegin;
    const end = projection.points.get(report.markers[1].element_index) orelse return error.MissingProjectedEnd;
    try std.testing.expect(begin.inherited);
    try std.testing.expectEqual(@as(usize, 0), begin.row);
    try std.testing.expectEqual(@as(usize, 0), begin.unit);
    try std.testing.expect(!end.inherited);
    try std.testing.expectEqual(@as(usize, 2), end.row);
    try std.testing.expectEqual(@as(usize, 1), end.unit);
    try std.testing.expectEqual(@as(usize, 1), try Selector.selectProjected(a, &trees, 0, &s.sections[0].structure_values.?, 2, &report, 1, 1, &projection));
}

test "mixed marker projection inherited binding tampering refuses query and mutation" {
    var s = try split();
    defer s.deinit();
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    row.sites.items[0].end += 1;
    try std.testing.expectError(error.InvalidTextSites, @import("field_outside_query.zig").canEdit(&s, 0, 3, 1, 2));
    try std.testing.expectError(error.InvalidTextSites, s.splice(0, 3, 1, 1, "Y"));
    row.sites.items[0].end -= 1;
    try assertState(&s, "Z");
}

test "mixed marker projection unknown begin link and current topology remain strict" {
    var s = try split();
    defer s.deinit();
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    report.unmatched_begins += 1;
    try std.testing.expectError(error.InvalidFieldLinks, Spans.projectForExterior(a, &trees, 0, &s.sections[0].structure_values.?, 2, &report, Editor.siteOptions(s.options), 200000));
    report.unmatched_begins -= 1;
    const marker = &s.sections[0].structure_values.?.paragraphs[2].field_positions.?[0];
    marker.unit += 1;
    try std.testing.expectError(error.InvalidFieldPositions, choose(a, &s));
    marker.unit -= 1;
    try assertState(&s, "Z");
}

test "mixed marker projection duplicate inherited site ownership refuses" {
    var s = try split();
    defer s.deinit();
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqual(@as(usize, 1), row.sites.items.len);
    const duplicate_text = try a.dupe(u8, row.sites.items[0].text);
    row.sites.items = a.realloc(row.sites.items, 2) catch |err| {
        a.free(duplicate_text);
        return err;
    };
    row.sites.items[1] = row.sites.items[0];
    row.sites.items[1].text = duplicate_text;
    try std.testing.expectError(error.SourceBindingMismatch, @import("field_outside_query.zig").canEdit(&s, 0, 3, 1, 2));
    try std.testing.expectError(error.SourceBindingMismatch, s.splice(0, 3, 1, 1, "Y"));
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}

test "mixed marker projection allocation failures retain current sites and dirty" {
    var s = try split();
    defer s.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Editor.Session) !void {
            try std.testing.expectEqual(@as(usize, 1), try choose(allocator, source));
        }
    }.run, .{&s});
    try assertState(&s, "Z");
}

fn splitZQ() !Editor.Session {
    const at = std.mem.indexOf(u8, xml, "<p:t>Z</p:t>").?;
    const derived = try std.mem.concat(a, u8, &.{ xml[0..at], "<p:t>ZQ</p:t>", xml[at + "<p:t>Z</p:t>".len ..] });
    defer a.free(derived);
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, derived);
    defer a.free(input);
    var s = try Editor.open(a, input, .{});
    errdefer s.deinit();
    try std.testing.expect(try s.splitParagraph(0, 2, 0, 0));
    return s;
}

fn expectRejected(s: *Editor.Session, wanted: anyerror) !void {
    const requests = [_]struct { start: u32, deleted: u32 }{
        .{ .start = 1, .deleted = 1 }, // old field-end proof
        .{ .start = 2, .deleted = 1 }, // ZQ mid-range, not a field boundary
        .{ .start = 2, .deleted = 0 }, // pure insertion formerly returned early
    };
    for (requests) |request| {
        try std.testing.expectError(wanted, @import("field_outside_query.zig").canEdit(s, 0, 3, request.start, request.start + request.deleted));
        try std.testing.expectError(wanted, s.splice(0, 3, request.start, request.deleted, "Y"));
        const trees = [_]Tree{s.sections[0].tree};
        var report = try @import("field_markers.zig").inspect(a, &trees, .{});
        defer report.deinit();
        try std.testing.expectError(wanted, Selector.select(a, &trees, 0, &s.sections[0].structure_values.?, 2, &report, request.start, request.deleted, Editor.siteOptions(s.options), 200000));
    }
    const target = &s.sections[0].structure_values.?.paragraphs[2];
    try std.testing.expectEqualStrings("B", target.sites.items[0].text);
    try std.testing.expectEqualStrings("ZQ", target.sites.items[1].text);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}

test "mixed marker canonical proof rejects inherited binding on mid-range and insertion" {
    var s = try splitZQ();
    defer s.deinit();
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    const ending = row.sites.items[0].end;
    row.sites.items[0].end += 1;
    defer row.sites.items[0].end = ending;
    try expectRejected(&s, error.InvalidTextSites);
}

test "mixed marker canonical proof rejects foreign-owner site before any range decision" {
    var s = try splitZQ();
    defer s.deinit();
    const rows = s.sections[0].structure_values.?.paragraphs;
    const original = rows[0].sites.items[0];
    rows[0].sites.items[0] = rows[2].sites.items[0];
    defer rows[0].sites.items[0] = original;
    try expectRejected(&s, error.SourceBindingMismatch);
}

test "mixed marker canonical proof rejects inherited explicit ownership exchange" {
    var s = try splitZQ();
    defer s.deinit();
    const rows = s.sections[0].structure_values.?.paragraphs;
    const inherited = rows[0].field_positions;
    const explicit = rows[1].field_positions;
    rows[0].field_positions = explicit;
    rows[1].field_positions = inherited;
    defer {
        rows[0].field_positions = inherited;
        rows[1].field_positions = explicit;
    }
    try expectRejected(&s, error.SourceBindingMismatch);
}

test "mixed marker valid ZQ mid-range and insertion stay editable" {
    var s = try splitZQ();
    defer s.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&s, 0, 3, 2, 3));
    try std.testing.expect(try s.splice(0, 3, 2, 1, "Y"));
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&s, 0, 3, 2, 2));
    try std.testing.expect(try s.splice(0, 3, 2, 0, "!"));
    const tail = try @import("field_label_display_text.zig").read(&s, 0, 3);
    defer a.free(tail);
    try std.testing.expectEqualStrings("BZ!Y", tail);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}

test "mixed marker new projection honors explicit source options and legacy build stays unchanged" {
    var s = try splitZQ();
    defer s.deinit();
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const current = &s.sections[0].structure_values.?;
    const old_spans = try Spans.buildForExterior(a, &trees, 0, current, 2, &report, 200000);
    defer a.free(old_spans);
    try std.testing.expect(old_spans.len != 0);
    var options = Editor.siteOptions(s.options);
    options.max_sites = 1;
    try std.testing.expectError(error.LimitExceeded, Spans.projectForExterior(a, &trees, 0, current, 2, &report, options, 200000));
    report.unmatched_begins += 1;
    try std.testing.expectError(error.InvalidFieldLinks, Spans.projectForExterior(a, &trees, 0, current, 2, &report, options, 200000));
}

test "mixed marker nonempty marker ownership exchange rejects projection itself" {
    var s = try splitZQ();
    defer s.deinit();
    const rows = s.sections[0].structure_values.?.paragraphs;
    const inherited = rows[0].field_positions;
    const explicit = rows[2].field_positions;
    rows[0].field_positions = explicit;
    rows[2].field_positions = inherited;
    defer {
        rows[0].field_positions = inherited;
        rows[2].field_positions = explicit;
    }
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    try std.testing.expectError(error.SourceBindingMismatch, Spans.projectForExterior(a, &trees, 0, &s.sections[0].structure_values.?, 2, &report, Editor.siteOptions(s.options), 200000));
}
