//! 실제 ZIP 입력과 현재 explicit 모델에서 삽입 소유권을 검증합니다.
const std = @import("std");
const Editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Selector = @import("field_current_exterior_insertion_site.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>";
const suffix = "</p:run></p:p></s:sec>";

fn open(tail: []const u8, styled: bool) !Editor.Session {
    const xml = try std.mem.concat(a, u8, &.{ prefix, tail, suffix });
    defer a.free(xml);
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var s = try Editor.open(a, input, .{});
    errdefer s.deinit();
    try @import("test_replacement_affinity_fixture.zig").materialize(&s, false);
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    for (s.sections[0].structure_values.?.paragraphs) |*row| {
        row.field_positions = try @import("field_source_positions.zig").build(a, &trees, 0, row, &report, 200000);
    }
    if (styled) {
        const row = &s.sections[0].structure_values.?.paragraphs[0];
        const positions = try @import("field_owned_positions.zig").build(a, &trees[0], row);
        defer a.free(positions);
        const projection = try @import("character_style_projection.zig").build(a, &trees[0], &row.sites, positions, 100);
        defer a.free(projection);
        row.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    }
    return s;
}
fn select(allocator: std.mem.Allocator, s: *const Editor.Session, start: u32, deleted: u32) !usize {
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(allocator, &trees, .{});
    defer report.deinit();
    return Selector.select(allocator, &trees, 0, &s.sections[0].structure_values.?, 0, &report, start, deleted, Editor.siteOptions(s.options), 200000);
}
fn assertField(s: *Editor.Session, tail: []const u8) !void {
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try Editor.open(a, saved, .{});
    defer reopened.deinit();
    const labels = try reopened.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    try std.testing.expectEqual(@as(usize, 1), labels[0].start);
    try std.testing.expectEqual(@as(usize, 2), labels[0].end);
    try std.testing.expectEqualStrings("A", reopened.sections[0].sites.items[1].text);
    try std.testing.expectEqualStrings(tail, reopened.sections[0].sites.items[2].text);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}

test "current exterior owner protected left plain style history and repeated edits" {
    for ([_]bool{ false, true }) |styled| {
        var s = try open("<p:t>Z</p:t>", styled);
        defer s.deinit();
        try std.testing.expectEqual(@as(usize, 2), try select(a, &s, 2, 1));
        var history = try @import("editor_history.zig").History.init(&s, 8, 4_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&s, .{ .paragraph = 1, .start = 2, .deleted = 1, .inserted = "Y" }));
        try assertField(&s, "Y");
        try std.testing.expect(try history.undo(&s));
        try assertField(&s, "Z");
        try std.testing.expect(try history.redo(&s));
        try assertField(&s, "Y");
        try std.testing.expect(try history.apply(&s, .{ .paragraph = 1, .start = 2, .deleted = 1, .inserted = "한😀" }));
        try assertField(&s, "한😀");
    }
}
fn titleCase(styled: bool) !void {
    var s = try open("<p:t>B<p:titleMark ignore='1'/>C</p:t>", styled);
    defer s.deinit();
    try std.testing.expectEqual(@as(usize, 2), try select(a, &s, 3, 1));
    try std.testing.expect(try s.splice(0, 1, 3, 1, "Y"));
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqualStrings("A", row.sites.items[1].text);
    try std.testing.expectEqualStrings("BY", row.sites.items[2].text);
    try std.testing.expectEqualStrings("", row.sites.items[3].text);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try Editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualStrings("BY", reopened.sections[0].sites.items[2].text);
    try std.testing.expectEqualStrings("", reopened.sections[0].sites.items[3].text);
    const tree = &reopened.sections[0].tree;
    const site = reopened.sections[0].sites.items[2];
    var title: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "titleMark")) {
        title = index;
    };
    try std.testing.expect(site.end <= tree.elements[title orelse return error.ExpectedTitleMark].start_tag.start);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}
test "current exterior owner outside titleMark plain preserves XML affinity" {
    try titleCase(false);
}
test "current exterior owner outside titleMark styled preserves XML affinity" {
    try titleCase(true);
}
test "current exterior owner empty field boundary still refuses replacement" {
    const xml = prefix[0 .. prefix.len - "<p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>".len] ++ "<p:t/><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t/><p:t>Z</p:t>" ++ suffix;
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var s = try Editor.open(a, bytes, .{});
    defer s.deinit();
    try @import("test_replacement_affinity_fixture.zig").materialize(&s, false);
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    row.field_positions = try @import("field_source_positions.zig").build(a, &trees, 0, row, &report, 200000);
    try std.testing.expectError(error.ProtectedFieldRange, select(a, &s, 1, 1));
}
test "current exterior owner source binding marker and piece tampering refuses without mutation" {
    var s = try open("<p:t>Z</p:t>", false);
    defer s.deinit();
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    const old_start = row.sites.items[1].start;
    row.sites.items[1].end += 1;
    try std.testing.expectError(error.InvalidTextSites, select(a, &s, 2, 1));
    row.sites.items[1].end -= 1;
    try std.testing.expectEqual(old_start, row.sites.items[1].start);
    row.field_positions.?[1].unit += 1;
    try std.testing.expectError(error.InvalidFieldPositions, select(a, &s, 2, 1));
    row.field_positions.?[1].unit -= 1;
    row.pieces = try a.alloc(@import("paragraph_joined_values.zig").Piece, 1);
    row.pieces.?[0] = .{ .template_element = row.template_element, .source_ordinal = row.source_ordinal, .generated_id = null, .first_site = 0, .site_count = row.sites.items.len };
    try std.testing.expectEqual(@as(usize, 2), try select(a, &s, 2, 1));
    row.pieces.?[0].site_count -= 1;
    try std.testing.expectError(error.SourceBindingMismatch, select(a, &s, 2, 1));
    row.pieces.?[0].site_count += 1;
    try std.testing.expectEqualStrings("A", row.sites.items[1].text);
    try std.testing.expectEqualStrings("Z", row.sites.items[2].text);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}
test "current exterior owner allocation failures leave current model and dirty unchanged" {
    var s = try open("<p:t>Z</p:t>", false);
    defer s.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Editor.Session) !void {
            try std.testing.expectEqual(@as(usize, 2), try select(allocator, source, 2, 1));
        }
    }.run, .{&s});
    try std.testing.expectEqualStrings("A", s.sections[0].structure_values.?.paragraphs[0].sites.items[1].text);
    try std.testing.expectEqualStrings("Z", s.sections[0].structure_values.?.paragraphs[0].sites.items[2].text);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}

test "current exterior owner tab empty-boundary counterexample keeps inline refusal" {
    // C의 symbolic 반례를 source XML로 만들되 기존 inline 지원 gate는 유지합니다.
    const begin = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE'/></p:ctrl><p:t>A<p:tab/></p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t/><p:t>Z</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, begin);
    defer a.free(bytes);
    var s = try Editor.open(a, bytes, .{});
    defer s.deinit();
    try @import("test_replacement_affinity_fixture.zig").materialize(&s, false);
    const trees = [_]Tree{s.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    row.field_positions = try @import("field_source_positions.zig").build(a, &trees, 0, row, &report, 200000);
    // source marker 생성은 허용해도 strict current partition의 inline gate는 유지합니다.
    try std.testing.expectError(error.UnsupportedInlineControl, select(a, &s, 2, 1));
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}

test "current exterior owner boundary insertion refusal and no-op preserve bytes" {
    var s = try open("<p:t>Z</p:t>", false);
    defer s.deinit();
    const before = try s.save();
    defer a.free(before);
    try std.testing.expectError(error.ProtectedFieldRange, select(a, &s, 2, 0));
    try std.testing.expect(!try s.splice(0, 1, 2, 1, "Z"));
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
}

test "current exterior owner canonical empty outside site is retained during replacement" {
    var s = try open("<p:t/><p:t>Z</p:t>", false);
    defer s.deinit();
    // generic left는 A입니다. 보호 left를 옮길 때 빈 outside site를 삭제하지 않습니다.
    try std.testing.expectEqual(@as(usize, 3), try select(a, &s, 2, 1));
    try std.testing.expect(try s.splice(0, 1, 2, 1, "Y"));
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqualStrings("A", row.sites.items[1].text);
    try std.testing.expectEqualStrings("", row.sites.items[2].text);
    try std.testing.expect(row.sites.items[2].empty_element);
    try std.testing.expectEqualStrings("Y", row.sites.items[3].text);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try Editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualStrings("", reopened.sections[0].sites.items[2].text);
    const empty = reopened.sections[0].sites.items[2];
    try std.testing.expectEqualStrings("<p:t></p:t>", reopened.sections[0].tree.sourceOf(empty.element_index));
    try std.testing.expect(!empty.empty_element);
    try std.testing.expectEqualStrings("Y", reopened.sections[0].sites.items[3].text);
}
