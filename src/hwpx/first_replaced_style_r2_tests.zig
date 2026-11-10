//! Constructor-only first-replaced independent transaction contract.
const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");
const a = std.testing.allocator;
const Edit = @import("../model/independent_text_edits.zig").Edit;
const left = "<p:run charPrIDRef='0' keep='L'><p:t>A</p:t></p:run>";
const right = "<p:run charPrIDRef='1' keep='R'><p:t>BC</p:t></p:run>";
fn input(allocator: std.mem.Allocator, runs: []const u8, extra: []const u8) ![]u8 {
    const seed = try @import("../new_document/root.zig").hwpx(allocator);
    defer allocator.free(seed);
    var s = try editor.open(allocator, seed, .{});
    defer s.deinit();
    const header = &s.original_header.?;
    var original: ?[]const u8 = null;
    for (header.elements, 0..) |node, i| if (node.is(@import("document_xml.zig").head_uri, "charPr")) {
        original = header.sourceOf(i);
        break;
    };
    const id = try std.mem.replaceOwned(u8, allocator, original.?, "id=\"0\"", "id=\"1\"");
    defer allocator.free(id);
    const height = try std.mem.replaceOwned(u8, allocator, id, "height=\"1000\"", "height=\"1900\"");
    defer allocator.free(height);
    const bold = try std.mem.replaceOwned(u8, allocator, height, "</hh:charPr>", "<hh:bold/></hh:charPr>");
    defer allocator.free(bold);
    const suffix = try std.mem.concat(allocator, u8, &.{ bold, "</hh:charProperties>" });
    defer allocator.free(suffix);
    const expanded = try std.mem.replaceOwned(u8, allocator, header.source, "</hh:charProperties>", suffix);
    defer allocator.free(expanded);
    const final_header = try std.mem.replaceOwned(u8, allocator, expanded, "charProperties itemCnt=\"1\"", "charProperties itemCnt=\"2\"");
    defer allocator.free(final_header);
    const xml = try std.mem.concat(allocator, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10' paraPrIDRef='0' styleIDRef='0'>", runs, "</p:p>", extra, "</s:sec>" });
    defer allocator.free(xml);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(allocator, xml, final_header);
}
fn command(p: usize, edits: []const Edit) history.Command {
    return .{ .kind = .independent_text, .paragraph = p, .start = 0, .deleted = 0, .inserted = "", .independent_text_edits = edits };
}
fn expectText(s: *editor.Session, p: usize, wanted: []const u8) !void {
    const text = try s.anchorText(0, p);
    defer s.allocator.free(text);
    try std.testing.expectEqualStrings(wanted, text);
}
fn expectStyle(s: *editor.Session, p: usize, unit: usize, id: u32) !void {
    const rows = try @import("character_style_snapshot.zig").read(s, 0, p);
    defer s.allocator.free(rows);
    for (rows) |row| if (row.start_unit <= unit and unit < row.end_unit) {
        try std.testing.expectEqual(@as(?u32, id), row.char_shape_id);
        return;
    };
    return error.MissingExpectedStyle;
}
test "HX first replaced r2 source boundary preserves first replaced style" {
    const bytes = try input(a, left ++ right, "");
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expect(try h.apply(&s, command(1, &.{.{ .start = 1, .end = 3, .text = "X", .expected = "BC" }})));
    try expectText(&s, 1, "AX");
    try expectStyle(&s, 1, 1, 1);
}

test "HX first replaced r2 whole paragraph leading empty and zero width remain explicit" {
    const Case = struct { runs: []const u8, start: u32, end: u32, text: []const u8, expected: []const u8, wanted: []const u8, id: u32 };
    for ([_]Case{
        .{ .runs = left ++ right, .start = 0, .end = 3, .text = "X", .expected = "ABC", .wanted = "X", .id = 0 },
        .{ .runs = "<p:run charPrIDRef='1'><p:t>BC</p:t></p:run>", .start = 0, .end = 1, .text = "X", .expected = "B", .wanted = "XC", .id = 1 },
        .{ .runs = "<p:run charPrIDRef='0'><p:t/></p:run>" ++ right, .start = 0, .end = 2, .text = "X", .expected = "BC", .wanted = "X", .id = 1 },
        .{ .runs = left ++ right, .start = 1, .end = 1, .text = "X", .expected = "", .wanted = "AXBC", .id = 0 },
        .{ .runs = "<p:run charPrIDRef='1'><p:t/></p:run>", .start = 0, .end = 0, .text = "X", .expected = "", .wanted = "X", .id = 1 },
        .{ .runs = "<p:run charPrIDRef='0'><p:t>😀</p:t></p:run>" ++ right, .start = 2, .end = 3, .text = "X", .expected = "B", .wanted = "😀XC", .id = 1 },
    }) |case| {
        const bytes = try input(a, case.runs, "");
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
        defer h.deinit();
        try std.testing.expect(try h.apply(&s, command(1, &.{.{ .start = case.start, .end = case.end, .text = case.text, .expected = case.expected }})));
        try expectText(&s, 1, case.wanted);
        const inserted = if (case.start == 2) @as(usize, 2) else if (case.start == 1 and case.end == 1) @as(usize, 1) else 0;
        try expectStyle(&s, 1, inserted, case.id);
        const saved = try s.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        try expectStyle(&reopened, 1, inserted, case.id);
        try std.testing.expect(try h.undo(&s));
        const undone = try s.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, bytes, undone);
        try std.testing.expect(try h.redo(&s));
        try expectStyle(&s, 1, inserted, case.id);
    }
}

test "HX first replaced r2 painted style inside same logical site and noop metadata" {
    const bytes = try input(a, "<p:run charPrIDRef='0'><p:t>ABC</p:t></p:run>", "");
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expect(try s.setCharacterProperties(0, 1, 1, 2, .{ .size = 1900, .bold = true }));
    const paragraph = &s.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqual(@as(usize, 1), paragraph.sites.items.len);
    const styles = paragraph.character_styles.?;
    try std.testing.expectEqual(@as(usize, 3), styles.len);
    const target_id = styles[1].char_shape_id.?;
    try std.testing.expect(target_id != styles[0].char_shape_id.?);
    const pointer = styles.ptr;
    s.history_delta_managed = true;
    var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    const serial = s.mutation_serial;
    try std.testing.expect(!try h.apply(&s, command(1, &.{.{ .start = 1, .end = 2, .text = "B", .expected = "B" }})));
    try std.testing.expectEqual(pointer, s.sections[0].structure_values.?.paragraphs[0].character_styles.?.ptr);
    try std.testing.expectEqual(serial, s.mutation_serial);
    try std.testing.expect(try h.apply(&s, command(1, &.{.{ .start = 1, .end = 2, .text = "X", .expected = "B" }})));
    try expectText(&s, 1, "AXC");
    try expectStyle(&s, 1, 0, 0);
    try expectStyle(&s, 1, 1, target_id);
    try expectStyle(&s, 1, 2, 0);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectStyle(&reopened, 1, 1, target_id);
    try std.testing.expect(try h.undo(&s));
    try expectText(&s, 1, "ABC");
    try expectStyle(&s, 1, 1, target_id);
    try std.testing.expect(try h.redo(&s));
    try expectText(&s, 1, "AXC");
    // Existing single/typed-input boundary contract remains left-affine.
    var single = try editor.open(a, bytes, .{});
    defer single.deinit();
    _ = try single.setCharacterProperties(0, 1, 1, 2, .{ .size = 1900, .bold = true });
    try std.testing.expect(try single.splice(0, 1, 1, 1, "X"));
    try expectStyle(&single, 1, 1, 0);
}

test "HX first replaced r2 adjacent mixed edits original axis reversed groups and one undo" {
    const second = "<p:p id='20' paraPrIDRef='0' styleIDRef='0'>" ++ left ++ right ++ "</p:p>";
    const bytes = try input(a, left ++ right, second);
    defer a.free(bytes);
    var saved_first: ?[]u8 = null;
    defer if (saved_first) |b| a.free(b);
    for ([_]bool{ false, true }) |reverse| {
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
        defer h.deinit();
        const cuts = [_]Edit{
            .{ .start = 0, .end = 0, .text = "P", .expected = "" },
            .{ .start = 1, .end = 2, .text = "X", .expected = "B" },
            .{ .start = 2, .end = 3, .text = "Y", .expected = "C" },
        };
        const groups = [_]history.Command{ command(if (reverse) 2 else 1, &cuts), command(if (reverse) 1 else 2, &cuts) };
        try std.testing.expect(try h.applyBatch(&s, &groups));
        try std.testing.expectEqual(@as(u32, 1), h.revision());
        for ([_]usize{ 1, 2 }) |p| {
            try expectText(&s, p, "PAXY");
            try expectStyle(&s, p, 0, 0);
            try expectStyle(&s, p, 1, 0);
            try expectStyle(&s, p, 2, 1);
            try expectStyle(&s, p, 3, 1);
        }
        const saved = try s.save();
        defer a.free(saved);
        if (saved_first) |before| try std.testing.expectEqualSlices(u8, before, saved) else saved_first = try a.dupe(u8, saved);
        try std.testing.expect(std.mem.indexOf(u8, saved, "keep='L'") != null);
        try std.testing.expect(std.mem.indexOf(u8, saved, "keep='R'") != null);
        try std.testing.expect(try h.undo(&s));
        const undone = try s.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, bytes, undone);
        try std.testing.expect(try h.redo(&s));
        try expectStyle(&s, 2, 2, 1);
    }
}

test "HX first replaced r2 tab anchor controls surrogate and late expected preserve redo" {
    const runs = left ++ "<p:run charPrIDRef='0'><p:t><p:tab/></p:t><p:pic/></p:run>" ++ right;
    const extra = "<p:p id='20' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='1'><p:t>😀BC</p:t></p:run></p:p>";
    const bytes = try input(a, runs, extra);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
    defer h.deinit();
    try std.testing.expect(try h.apply(&s, command(2, &.{.{ .start = 2, .end = 4, .text = "NEXT", .expected = "BC" }})));
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectError(error.ProtectedInlineControl, h.apply(&s, command(1, &.{.{ .start = 1, .end = 2, .text = "X", .expected = "\t" }})));
    try std.testing.expectError(error.ProtectedInlineControl, h.apply(&s, command(1, &.{.{ .start = 2, .end = 3, .text = "X", .expected = "\xef\xbf\xbc" }})));
    try std.testing.expectError(error.SplitSurrogatePair, h.apply(&s, command(2, &.{.{ .start = 0, .end = 1, .text = "X" }})));
    try std.testing.expectError(error.InvalidXmlCharacter, h.apply(&s, command(2, &.{.{ .start = 2, .end = 3, .text = "\x01", .expected = "B" }})));
    try std.testing.expectError(error.ExpectedTextMismatch, h.applyBatch(&s, &.{ command(1, &.{.{ .start = 3, .end = 4, .text = "X", .expected = "B" }}), command(2, &.{.{ .start = 2, .end = 3, .text = "Y", .expected = "Z" }}) }));
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, bytes, after);
    try std.testing.expect(try h.redo(&s));
    try expectText(&s, 2, "😀NEXT");
    try std.testing.expect(try h.apply(&s, command(1, &.{.{ .start = 3, .end = 4, .text = "X", .expected = "B" }})));
    try expectStyle(&s, 1, 3, 1);
}

test "HX first replaced r2 selected exhaustive OOM preserves full style state and redo" {
    const second = "<p:p id='20' paraPrIDRef='0' styleIDRef='0'>" ++ left ++ right ++ "</p:p>";
    const bytes = try input(a, left ++ right, second);
    defer a.free(bytes);
    var measured: usize = 0;
    var rejected: usize = 0;
    var sample: usize = 0;
    while (sample == 0 or sample <= measured) : (sample += 1) {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var s = try editor.open(fa, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
        defer h.deinit();
        try std.testing.expect(try h.apply(&s, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "!" }));
        try std.testing.expect(try h.undo(&s));
        const revision = h.revision();
        const count = h.revisionCount();
        const before = failing.alloc_index;
        if (sample != 0) failing.fail_index = before + sample - 1;
        const changed = h.applyBatch(&s, &.{ command(1, &.{.{ .start = 1, .end = 3, .text = "X", .expected = "BC" }}), command(2, &.{.{ .start = 1, .end = 2, .text = "Y", .expected = "B" }}) }) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expect(!h.stats().poisoned);
            try std.testing.expect(!s.history_transaction_active);
            try std.testing.expectEqual(revision, h.revision());
            try std.testing.expectEqual(count, h.revisionCount());
            try expectStyle(&s, 1, 0, 0);
            try expectStyle(&s, 1, 1, 1);
            try expectStyle(&s, 2, 1, 1);
            const after = try s.save();
            defer fa.free(after);
            try std.testing.expectEqualSlices(u8, bytes, after);
            try std.testing.expect(try h.redo(&s));
            try expectText(&s, 2, "!ABC");
            rejected += 1;
            continue;
        };
        try std.testing.expectEqual(@as(usize, 0), sample);
        try std.testing.expect(changed);
        measured = failing.alloc_index - before;
        try std.testing.expect(measured > 0 and measured < 2000);
        try expectStyle(&s, 1, 1, 1);
        try expectStyle(&s, 2, 1, 1);
    }
    try std.testing.expectEqual(measured, rejected);
    std.debug.print("FIRST_REPLACED_OOM exhaustive_points={d} rejected={d} restored_redo={d}\n", .{ measured, rejected, rejected });
}

test "HX first replaced r2 same site adjacent replacements versus legacy zero width" {
    const bytes = try input(a, "<p:run charPrIDRef='0'><p:t>ABC</p:t></p:run>", "");
    defer a.free(bytes);
    for ([_]bool{ false, true }) |insertion| {
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        _ = try s.setCharacterProperties(0, 1, 1, 2, .{ .size = 1900, .bold = true });
        const target_id = s.sections[0].structure_values.?.paragraphs[0].character_styles.?[1].char_shape_id.?;
        s.history_delta_managed = true;
        var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
        defer h.deinit();
        if (insertion) {
            try std.testing.expect(try h.apply(&s, command(1, &.{.{ .start = 1, .end = 1, .text = "X", .expected = "" }})));
            try expectText(&s, 1, "AXBC");
            try expectStyle(&s, 1, 1, 0);
            try expectStyle(&s, 1, 2, target_id);
        } else {
            try std.testing.expect(try h.apply(&s, command(1, &.{ .{ .start = 0, .end = 1, .text = "X", .expected = "A" }, .{ .start = 1, .end = 2, .text = "Y", .expected = "B" } })));
            try expectText(&s, 1, "XYC");
            try expectStyle(&s, 1, 0, 0);
            try expectStyle(&s, 1, 1, target_id);
            try expectStyle(&s, 1, 2, 0);
        }
    }
}

test "HX first replaced r2 generic defaults and explicit owner conflict stay isolated" {
    const tx = @import("text_splice_transaction.zig");
    const Site = @import("text_sites.zig").Site;
    const Sites = @import("text_sites.zig").Sites;
    const positions = [_]@import("paragraph_text_positions.zig").Segment{
        .{ .kind = .text, .index = 0, .source_start = 10, .start_unit = 0, .end_unit = 1 },
        .{ .kind = .text, .index = 1, .source_start = 20, .start_unit = 1, .end_unit = 3 },
    };
    for ([_]bool{ false, true }) |conflict| {
        const items = try a.alloc(Site, 2);
        items[0] = .{ .element_index = 1, .start = 10, .end = 11, .text = try a.dupe(u8, "A") };
        items[1] = .{ .element_index = 2, .start = 20, .end = 22, .text = try a.dupe(u8, "BC") };
        var sites: Sites = .{ .items = items };
        defer sites.deinit(a);
        if (conflict) {
            const first = sites.items[0].text.ptr;
            const second = sites.items[1].text.ptr;
            try std.testing.expectError(error.InvalidInsertionSite, tx.spliceManyProjected(a, &sites, &positions, &.{.{ .start = 1, .end = 3, .text = "X", .expected = "BC" }}, .{ .max_bytes = 100, .replacement_inheritance = .first_replaced, .insertion_sites = &.{0} }));
            try std.testing.expectEqual(first, sites.items[0].text.ptr);
            try std.testing.expectEqual(second, sites.items[1].text.ptr);
            try std.testing.expectEqualStrings("A", sites.items[0].text);
            try std.testing.expectEqualStrings("BC", sites.items[1].text);
        } else {
            try std.testing.expect(try tx.spliceManyProjected(a, &sites, &positions, &.{.{ .start = 1, .end = 3, .text = "X", .expected = "BC" }}, .{ .max_bytes = 100 }));
            try std.testing.expectEqualStrings("AX", sites.items[0].text);
            try std.testing.expectEqualStrings("", sites.items[1].text);
        }
    }
}

test "HX first replaced r2 source and style work remain monotone N 2N 4N" {
    const tx = @import("text_splice_transaction.zig");
    const Site = @import("text_sites.zig").Site;
    const Sites = @import("text_sites.zig").Sites;
    const Span = @import("character_style_paint.zig").Span;
    var previous: usize = 0;
    for ([_]usize{ 32, 64, 128 }) |n| {
        const items = try a.alloc(Site, n * 2);
        const positions = try a.alloc(@import("paragraph_text_positions.zig").Segment, n * 2);
        defer a.free(positions);
        const spans = try a.alloc(Span, n * 2);
        const cuts = try a.alloc(Edit, n);
        defer a.free(cuts);
        for (items, positions, spans, 0..) |*site, *position, *span, i| {
            site.* = .{ .element_index = i + 1, .start = 10 + i * 3, .end = 11 + i * 3, .text = try a.dupe(u8, if (i % 2 == 0) "A" else "B") };
            position.* = .{ .kind = .text, .index = i, .source_start = site.start, .start_unit = i, .end_unit = i + 1 };
            span.* = .{ .start_unit = i, .end_unit = i + 1, .site_start_unit = i, .site_index = i, .run_element = i + 1, .char_shape_id = @intCast(i % 2) };
        }
        for (cuts, 0..) |*cut, i| cut.* = .{ .start = @intCast(i * 2 + 1), .end = @intCast(i * 2 + 2), .text = "X", .expected = "B" };
        var paragraph: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = 0, .source_ordinal = 1, .sites = .{ .items = items }, .character_styles = spans };
        defer paragraph.deinit(a);
        var measured_sites: Sites = try paragraph.sites.clone(a);
        defer measured_sites.deinit(a);
        var work: tx.bulkTesting.Counters = .{};
        try std.testing.expect(try tx.bulkTesting.applyMeasured(a, &measured_sites, positions, cuts, .{ .max_bytes = 1_000_000, .replacement_inheritance = .first_replaced }, &work));
        var text = try tx.prepareManyProjected(a, &paragraph.sites, positions, cuts, .{ .max_bytes = 1_000_000, .replacement_inheritance = .first_replaced });
        defer text.deinit();
        var style_work: @import("character_style_splice.zig").bulkTesting.Counters = .{};
        var metadata = try @import("character_style_splice.zig").bulkTesting.prepareMeasured(a, &paragraph, &text, spans, 1_000_000, &style_work);
        defer metadata.deinit();
        try std.testing.expect(try metadata.commit(&paragraph, &text));
        var total: usize = 0;
        inline for (@import("../reflection.zig").fields(@TypeOf(work))) |field| total += @field(work, field.name);
        inline for (@import("../reflection.zig").fields(@TypeOf(style_work))) |field| total += @field(style_work, field.name);
        if (previous != 0) try std.testing.expect(total <= previous * 2 + 32);
        previous = total;
        for (paragraph.sites.items, measured_sites.items, 0..) |site, other, i| {
            try std.testing.expectEqualStrings(other.text, site.text);
            try std.testing.expectEqualStrings(if (i % 2 == 0) "A" else "X", site.text);
            try std.testing.expectEqual(@as(?u32, @intCast(i % 2)), paragraph.character_styles.?[i].char_shape_id);
        }
        std.debug.print("FIRST_REPLACED_WORK N={d} total={d} source_bytes={d} spans={d} changes={d}\n", .{ n, total, work.source_bytes, style_work.spans, style_work.changes });
    }
}

test "HX first replaced r2 current generated and joined style owner boundaries" {
    const second = "<p:p id='20' paraPrIDRef='0' styleIDRef='0'>" ++ left ++ right ++ "</p:p>";
    for ([_]bool{ false, true }) |joined| {
        const bytes = try input(a, left ++ right, if (joined) second else "");
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try history.History.initV2(&s, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 });
        defer h.deinit();
        if (joined) {
            try std.testing.expect(try h.apply(&s, .{ .kind = .merge, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" }));
            try std.testing.expect(s.sections[0].structure_values.?.paragraphs[0].pieces != null);
            try expectStyle(&s, 1, 2, 1);
            try expectStyle(&s, 1, 3, 0);
        } else {
            try std.testing.expect(try h.apply(&s, .{ .kind = .split, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "" }));
            try std.testing.expect(s.sections[0].structure_values.?.paragraphs[1].generated_id != null);
        }
        const before = try s.save();
        defer a.free(before);
        const p: usize = if (joined) 1 else 2;
        const point: u32 = if (joined) 3 else 0;
        const id: u32 = if (joined) 0 else 1;
        try std.testing.expect(try h.apply(&s, command(p, &.{.{ .start = point, .end = point + 1, .text = "X", .expected = if (joined) "A" else "B" }})));
        try expectStyle(&s, p, point, id);
        const after = try s.save();
        defer a.free(after);
        var reopened = try editor.open(a, after, .{});
        defer reopened.deinit();
        try expectStyle(&reopened, p, point, id);
        try std.testing.expect(try h.undo(&s));
        const undone = try s.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try h.redo(&s));
        try expectStyle(&s, p, point, id);
    }
}
