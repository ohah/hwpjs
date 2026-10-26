const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoint = @import("editor_checkpoint.zig");
const label_display = @import("field_label_display_text.zig");
const a = std.testing.allocator;
const paras = [_]usize{ 17, 60, 2 };
fn load(i: usize) ![]u8 {
    return @import("inherited_field_test_source.zig").load(a, i);
}
fn checkDisplay(s: *editor.Session, p: usize, expected: []const u8) !void {
    const labels = try s.fieldLabels(0, p);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    const text = try label_display.read(s, 0, p);
    defer a.free(text);
    try std.testing.expectEqualStrings(expected, text);
}
fn savedEqual(s: *editor.Session, expected: []const u8) !void {
    const bytes = try s.save();
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, expected, bytes);
}

test "inherited candidate actual three field edit continuity history repeat and reopen" {
    for (paras, 0..) |p, i| {
        const input = try load(i);
        defer a.free(input);
        var s = try editor.open(a, input, .{});
        defer s.deinit();
        const original = try label_display.read(&s, 0, p);
        defer a.free(original);
        var undo0 = try checkpoint.capture(&s, std.math.maxInt(usize));
        defer undo0.deinit();
        try std.testing.expect(try s.splice(0, 1, 0, 0, "검증😀"));
        try checkDisplay(&s, p, original);
        const base = try s.save();
        defer a.free(base);

        var undo1 = try checkpoint.capture(&s, std.math.maxInt(usize));
        defer undo1.deinit();
        const labels = try s.fieldLabels(0, p);
        defer a.free(labels);
        const begin = labels[0].begin_element;
        try std.testing.expect(try s.spliceFieldLabel(0, p, begin, labels[0].start, 0, "앞😀<&"));
        const expected1 = try std.mem.concat(a, u8, &.{ "앞😀<&", original });
        defer a.free(expected1);
        try checkDisplay(&s, p, expected1);
        const first = try s.save();
        defer a.free(first);

        var undo2 = try checkpoint.capture(&s, std.math.maxInt(usize));
        defer undo2.deinit();
        const now = try s.fieldLabels(0, p);
        defer a.free(now);
        try std.testing.expectEqual(labels[0].end + 5, now[0].end);
        try std.testing.expect(try s.spliceFieldLabel(0, p, begin, now[0].start, 0, "다시"));
        const expected2 = try std.mem.concat(a, u8, &.{ "다시", expected1 });
        defer a.free(expected2);
        try checkDisplay(&s, p, expected2);
        const second = try s.save();
        defer a.free(second);

        // Checkpoints are the native editor history exchange mechanism, not
        // display fallbacks. Query text always comes from current owned sites.
        try undo2.exchange(&s);
        try savedEqual(&s, first);
        try checkDisplay(&s, p, expected1);
        try undo1.exchange(&s);
        try savedEqual(&s, base);
        try checkDisplay(&s, p, original);
        try undo0.exchange(&s);
        try savedEqual(&s, input);
        try checkDisplay(&s, p, original);
        try undo0.exchange(&s);
        try savedEqual(&s, base);
        try undo1.exchange(&s);
        try savedEqual(&s, first);
        try undo2.exchange(&s);
        try savedEqual(&s, second);
        try checkDisplay(&s, p, expected2);
        var reopened = try editor.open(a, second, .{});
        defer reopened.deinit();
        try checkDisplay(&reopened, p, expected2);
        try savedEqual(&reopened, second);
        try std.testing.expect(try reopened.splice(0, 1, 0, 0, "재"));
        try checkDisplay(&reopened, p, expected2);
        const targets = try reopened.fieldLabels(0, p);
        defer a.free(targets);
        try std.testing.expect(try reopened.spliceFieldLabel(0, p, targets[0].begin_element, targets[0].start, 0, "또"));
        const expected3 = try std.mem.concat(a, u8, &.{ "또", expected2 });
        defer a.free(expected3);
        try checkDisplay(&reopened, p, expected3);
        const third = try reopened.save();
        defer a.free(third);

        var again = try editor.open(a, third, .{});
        defer again.deinit();
        try checkDisplay(&again, p, expected3);
        try std.testing.expectEqualSlices(u8, input, s.source);
    }
}

fn installCurrent(s: *editor.Session) !void {
    if (s.sections[0].structure_values != null) return;
    const part = &s.sections[0];
    var report = @import("section_text.zig").Report{};
    const values = try @import("paragraph_structure_collect.zig").collect(s.allocator, &part.tree, &part.sites, part.locations, editor.siteOptions(s.options), &report);
    part.sites.deinit(s.allocator);
    part.sites = .{ .items = &.{} };
    part.structure_values = values;
}
fn rejectedMutation(s: *editor.Session, p: usize, begin: u32, start: u32, deleted: u32, text: []const u8) !void {
    const before = try s.save();
    defer a.free(before);
    if (s.spliceFieldLabel(0, p, begin, start, deleted, text)) |_| return error.ExpectedRefusal else |err| {
        if (err == error.OutOfMemory) return err;
    }
    try savedEqual(s, before);
}

test "inherited candidate actual anchors and surrogate ranges remain protected" {
    for (paras, 0..) |p, i| {
        const bytes = try load(i);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        try std.testing.expect(try s.splice(0, 1, 0, 0, "검증😀"));
        const labels = try s.fieldLabels(0, p);
        defer a.free(labels);
        const prepared = try @import("field_label_session.zig").prepare(&s, 0, p, labels[0].begin_element);
        defer prepared.deinit(a);
        var anchors: usize = 0;
        for (prepared.segments) |seg| {
            if (seg.kind != .anchor) continue;
            anchors += 1;
            try std.testing.expectEqual(@as(usize, 1), seg.end_unit - seg.start_unit);
            try std.testing.expectError(error.ProtectedInlineControl, s.spliceFieldLabel(0, p, labels[0].begin_element, @intCast(seg.start_unit), 1, ""));
            try rejectedMutation(&s, p, labels[0].begin_element, labels[0].start, labels[0].end - labels[0].start, "");
        }
        try std.testing.expectEqual(@as(usize, 1), anchors);
        try rejectedMutation(&s, p, labels[0].begin_element, labels[0].end + 1, 0, "outside");
        try std.testing.expect(try s.spliceFieldLabel(0, p, labels[0].begin_element, 0, 0, "앞😀"));
        try std.testing.expectError(error.SplitSurrogatePair, s.spliceFieldLabel(0, p, labels[0].begin_element, 2, 0, "bad"));
        try rejectedMutation(&s, p, labels[0].begin_element, 0, 0, &.{0});
        var redo = try checkpoint.capture(&s, std.math.maxInt(usize));
        defer redo.deinit();
        const saved = try s.save();
        defer a.free(saved);
        try rejectedMutation(&s, p, labels[0].begin_element, 2, 0, "bad");
        try redo.exchange(&s);
        try savedEqual(&s, saved);
        try redo.exchange(&s);
        try savedEqual(&s, saved);
    }
}

const ns = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const outside = "<p:p><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>outside</p:t></p:run></p:p>";
fn fixture(kind: []const u8, content: []const u8, nested: bool) ![]u8 {
    const inner = if (nested) "<p:ctrl><p:fieldBegin id='2' type='CLICK_HERE'/></p:ctrl><p:t>secret</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl>" else "";
    const xml = try std.fmt.allocPrint(a, "{s}{s}<p:p><p:run><p:ctrl><p:fieldBegin id='1' type='{s}'/></p:ctrl><p:t>A</p:t>{s}{s}<p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>", .{ ns, outside, kind, inner, content });
    defer a.free(xml);
    return @import("test_formula_fixture.zig").zipWithSection(a, xml);
}

test "inherited candidate narrow fallback and generic label controls" {
    for ([_]struct { kind: []const u8, anchor: []const u8, allow: bool }{
        .{ .kind = "CLICK_HERE", .anchor = "<p:tbl/>", .allow = true },
        .{ .kind = "CLICK_HERE", .anchor = "", .allow = true },
        .{ .kind = "BOOKMARK", .anchor = "", .allow = true },
        .{ .kind = "HYPERLINK", .anchor = "", .allow = true },
        .{ .kind = "BOOKMARK", .anchor = "<p:tbl/>", .allow = false },
        .{ .kind = "HYPERLINK", .anchor = "<p:tbl/>", .allow = false },
        .{ .kind = "CLICK_HERE", .anchor = "<p:pic/>", .allow = false },
        .{ .kind = "UNKNOWN", .anchor = "<p:tbl/>", .allow = false },
    }) |c| {
        const bytes = try fixture(c.kind, c.anchor, false);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        try installCurrent(&s);
        const labels = try s.fieldLabels(0, 2);
        defer a.free(labels);
        try std.testing.expectEqual(@as(usize, if (c.allow) 1 else 0), labels.len);
        const begin = s.source_fields.?.report.markers[0].element_index;
        if (c.allow) try std.testing.expect(try s.spliceFieldLabel(0, 2, begin, 0, 0, "OK")) else try rejectedMutation(&s, 2, @intCast(begin), 0, 0, "NO");
    }
    // Cache type metadata must not impersonate a supported source kind.
    const bookmark = try fixture("BOOKMARK", "<p:tbl/>", false);
    defer a.free(bookmark);
    var spoof = try editor.open(a, bookmark, .{});
    defer spoof.deinit();
    try installCurrent(&spoof);
    const copied_markers = try a.dupe(@import("field_markers.zig").Marker, spoof.source_fields.?.report.markers);
    defer a.free(copied_markers);
    copied_markers[0].begin.?.type_raw = "CLICK_HERE";
    var forged = spoof;
    forged.source_fields.?.report.markers = copied_markers;
    try std.testing.expectError(error.SourceBindingMismatch, forged.fieldLabels(0, 2));
    try std.testing.expectError(error.SourceBindingMismatch, forged.spliceFieldLabel(0, 2, copied_markers[0].element_index, 0, 0, "NO"));
    const nested = try fixture("CLICK_HERE", "<p:tbl/>", true);
    defer a.free(nested);
    var s = try editor.open(a, nested, .{});
    defer s.deinit();
    const before = try s.fieldLabels(0, 2);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 2), before.len);
    try std.testing.expectError(error.ProtectedFieldRange, s.spliceFieldLabel(0, 2, before[0].begin_element, 2, 0, "NO"));
    try installCurrent(&s);
    try std.testing.expectError(error.UnsupportedNestedFieldLabel, s.spliceFieldLabel(0, 2, before[0].begin_element, 2, 0, "NO"));
    const current = try s.fieldLabels(0, 2);
    defer a.free(current);
    try std.testing.expectEqual(@as(usize, 0), current.len);
}

fn rejectQueryAndMutation(s: *editor.Session, p: usize, begin: u32) !void {
    if (s.fieldLabels(0, p)) |labels| {
        defer a.free(labels);
        if (labels.len != 0) return error.UnsafeQueryPermission;
    } else |err| {
        if (err == error.OutOfMemory) return err;
    }
    if (s.spliceFieldLabel(0, p, begin, 0, 0, "NO")) |_| return error.UnsafeMutationPermission else |err| {
        if (err == error.OutOfMemory) return err;
    }
}

test "inherited candidate actual topology current positions and source tampering refuse both paths" {
    for (paras, 0..) |p, i| {
        const bytes = try load(i);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        try std.testing.expect(try s.splice(0, 1, 0, 0, "검증😀"));
        const targets = try s.fieldLabels(0, p);
        defer a.free(targets);
        const begin = targets[0].begin_element;
        const stable = try s.save();
        defer a.free(stable);
        const copies = try a.dupe(@import("paragraph_structure_values.zig").Paragraph, s.sections[0].structure_values.?.paragraphs);
        defer a.free(copies);
        var sections = [_]editor.Section{s.sections[0]};
        sections[0].structure_values = .{ .paragraphs = copies };
        var proxy = s;
        proxy.sections = &sections;
        const n = p - s.sections[0].first_paragraph;
        const old = copies[n];
        const first = copies[0];
        copies[0] = old;
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[0] = first;
        copies[n].source_ordinal = old.source_ordinal.? + 1;
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        copies[n].generated_id = 99;
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        copies[n].pieces = &.{};
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        copies[n].protected_positions = &.{};
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        copies[n].field_positions = &.{};
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        copies[n].column_boundaries = &.{};
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        copies[n].template_element = 0;
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        const site_copies = try a.dupe(@import("text_sites.zig").Site, old.sites.items);
        defer a.free(site_copies);
        copies[n].sites.items = site_copies;
        const old_site = site_copies[0];
        site_copies[0].start += 1;
        try rejectQueryAndMutation(&proxy, p, begin);
        site_copies[0] = old_site;
        site_copies[0].end += 1;
        try rejectQueryAndMutation(&proxy, p, begin);
        site_copies[0] = old_site;
        site_copies[0].anchor_boundary = !old_site.anchor_boundary;
        try rejectQueryAndMutation(&proxy, p, begin);
        site_copies[0] = old_site;
        site_copies[0].empty_element = !old_site.empty_element;
        try rejectQueryAndMutation(&proxy, p, begin);
        site_copies[0] = old_site;
        copies[n].sites.items = site_copies[1..];
        try rejectQueryAndMutation(&proxy, p, begin);
        copies[n] = old;
        sections[0].tree.source = sections[0].tree.source[0 .. sections[0].tree.source.len - 1];
        try rejectQueryAndMutation(&proxy, p, begin);
        sections[0].tree = s.sections[0].tree;
        const markers = try a.dupe(@import("field_markers.zig").Marker, s.source_fields.?.report.markers);
        defer a.free(markers);
        proxy.source_fields = s.source_fields;
        proxy.source_fields.?.report.markers = markers;
        const first_marker = markers[0];
        markers[0].begin = null;
        try rejectQueryAndMutation(&proxy, p, begin);
        markers[0] = first_marker;
        markers[0].kind = .end;
        try rejectQueryAndMutation(&proxy, p, begin);
        markers[0] = first_marker;
        markers[0].matched_marker_index = null;
        try rejectQueryAndMutation(&proxy, p, begin);
        markers[0] = first_marker;
        markers[0].raw_xml = "forged";
        try rejectQueryAndMutation(&proxy, p, begin);
        markers[0] = first_marker;
        try checkDisplay(&s, p, tryOriginalDisplay(i));
        try savedEqual(&s, stable);
    }
}
fn tryOriginalDisplay(i: usize) []const u8 {
    return if (i == 0) " \xef\xbf\xbc " else "\xef\xbf\xbc";
}

fn queryFailure(allocator: std.mem.Allocator, source: *const editor.Session, p: usize) !void {
    var proxy = source.*;
    proxy.allocator = allocator;
    const labels = try proxy.fieldLabels(0, p);
    defer allocator.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
}
fn mutationFailure(allocator: std.mem.Allocator, source: *const editor.Session, p: usize, begin: u32) !void {
    var proxy = source.*;
    proxy.allocator = allocator;
    proxy.sections = try allocator.dupe(editor.Section, source.sections);
    defer allocator.free(proxy.sections);
    proxy.sections[0].structure_values = try source.sections[0].structure_values.?.clone(allocator);
    defer proxy.sections[0].structure_values.?.deinit(allocator);
    proxy.sections[0].field_dirty = .empty;
    defer proxy.sections[0].field_dirty.deinit(allocator);
    try proxy.sections[0].field_dirty.appendSlice(allocator, source.sections[0].field_dirty.items);
    const changed = proxy.spliceFieldLabel(0, p, begin, 0, 0, "OOM😀<&") catch |err| {
        for (source.sections[0].structure_values.?.paragraphs, proxy.sections[0].structure_values.?.paragraphs) |old, now| {
            try std.testing.expectEqual(old.template_element, now.template_element);
            try std.testing.expectEqual(old.source_ordinal, now.source_ordinal);
            try std.testing.expectEqual(old.sites.items.len, now.sites.items.len);
            for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
            try std.testing.expectEqualDeep(old.character_styles, now.character_styles);
        }
        try std.testing.expectEqualSlices(@import("text_sites_save.zig").FieldDirty, source.sections[0].field_dirty.items, proxy.sections[0].field_dirty.items);
        return err;
    };
    try std.testing.expect(changed);
}

test "inherited candidate actual query mutation all allocation failures stay atomic" {
    for (paras, 0..) |p, i| {
        const bytes = try load(i);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        try std.testing.expect(try s.splice(0, 1, 0, 0, "검증😀"));
        const targets = try s.fieldLabels(0, p);
        defer a.free(targets);
        const stable = try s.save();
        defer a.free(stable);
        try @import("../testing/allocation_failures.zig").check(queryFailure, .{ &s, p });
        try @import("../testing/allocation_failures.zig").check(mutationFailure, .{ &s, p, targets[0].begin_element });
        try savedEqual(&s, stable);
        try checkDisplay(&s, p, tryOriginalDisplay(i));
    }
}

test "inherited candidate actual native History undo redo and refused field edit preserve redo" {
    const histories = @import("editor_history.zig");
    for (paras, 0..) |p, i| {
        const bytes = try load(i);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        var h = try histories.History.init(&s, 8, 16 * 1024 * 1024);
        defer h.deinit();
        const original = try label_display.read(&s, 0, p);
        defer a.free(original);
        try std.testing.expect(try h.apply(&s, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "検証😀" }));
        try checkDisplay(&s, p, original);
        const base = try s.save();
        defer a.free(base);
        const labels = try s.fieldLabels(0, p);
        defer a.free(labels);
        const begin = labels[0].begin_element;
        try std.testing.expect(try h.apply(&s, .{ .kind = .field, .paragraph = p, .begin_element = begin, .start = 0, .deleted = 0, .inserted = "앞😀<&" }));
        const first = try s.save();
        defer a.free(first);
        const first_text = try std.mem.concat(a, u8, &.{ "앞😀<&", original });
        defer a.free(first_text);
        try checkDisplay(&s, p, first_text);
        try std.testing.expect(try h.apply(&s, .{ .kind = .field, .paragraph = p, .begin_element = begin, .start = 0, .deleted = 0, .inserted = "반복" }));
        const second = try s.save();
        defer a.free(second);
        try std.testing.expect(try h.undo(&s));
        try savedEqual(&s, first);
        const rev = h.stack.revision;
        const next = h.stack.next_revision;
        const undo_len = h.stack.undo.items.len;
        const redo_len = h.stack.redo.items.len;
        const prepared = try @import("field_label_session.zig").prepare(&s, 0, p, begin);
        defer prepared.deinit(a);
        for (prepared.segments) |seg| if (seg.kind == .anchor) {
            try std.testing.expectError(error.ProtectedInlineControl, h.apply(&s, .{ .kind = .field, .paragraph = p, .begin_element = begin, .start = @intCast(seg.start_unit), .deleted = 1, .inserted = "" }));
        };
        try std.testing.expectError(error.InvalidXmlCharacter, h.apply(&s, .{ .kind = .field, .paragraph = p, .begin_element = begin, .start = 0, .deleted = 0, .inserted = &.{0} }));
        try std.testing.expect(!try h.apply(&s, .{ .kind = .field, .paragraph = p, .begin_element = begin, .start = 0, .deleted = 0, .inserted = "" }));
        try std.testing.expectEqual(rev, h.stack.revision);
        try std.testing.expectEqual(next, h.stack.next_revision);
        try std.testing.expectEqual(undo_len, h.stack.undo.items.len);
        try std.testing.expectEqual(redo_len, h.stack.redo.items.len);
        try savedEqual(&s, first);
        try std.testing.expect(try h.redo(&s));
        try savedEqual(&s, second);
        try std.testing.expect(try h.undo(&s));
        try savedEqual(&s, first);
        try std.testing.expect(try h.undo(&s));
        try savedEqual(&s, base);
        try checkDisplay(&s, p, original);
        try std.testing.expect(try h.undo(&s));
        try savedEqual(&s, bytes);
        try checkDisplay(&s, p, original);
        try std.testing.expect(try h.redo(&s));
        try savedEqual(&s, base);
        try std.testing.expect(try h.redo(&s));
        try savedEqual(&s, first);
        try std.testing.expect(try h.redo(&s));
        try savedEqual(&s, second);
    }
}

test "inherited candidate actual insertion on both table sides uses owned current sites" {
    for (paras, 0..) |p, i| {
        const input = try load(i);
        defer a.free(input);
        var s = try editor.open(a, input, .{});
        defer s.deinit();
        const original = try label_display.read(&s, 0, p);
        defer a.free(original);
        try std.testing.expect(try s.splice(0, 1, 0, 0, "검증😀"));
        const before = try s.fieldLabels(0, p);
        defer a.free(before);
        try std.testing.expect(try s.spliceFieldLabel(0, p, before[0].begin_element, before[0].start, 0, "왼"));
        const after = try s.fieldLabels(0, p);
        defer a.free(after);
        try std.testing.expect(try s.spliceFieldLabel(0, p, after[0].begin_element, after[0].end, 0, "오른"));
        const expected = try std.mem.concat(a, u8, &.{ "왼", original, "오른" });
        defer a.free(expected);
        try checkDisplay(&s, p, expected);
        const bytes = try s.save();
        defer a.free(bytes);

        var reopened = try editor.open(a, bytes, .{});
        defer reopened.deinit();
        try checkDisplay(&reopened, p, expected);
    }
}
