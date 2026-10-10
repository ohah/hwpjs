//! 원본 필드 마커를 현재 텍스트의 폭 없는 위치에 연결합니다.
//! 필드 종류별 편집 권한이나 구조 변경의 게시 권한은 제공하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const fields = @import("field_markers.zig");

pub const Position = @import("field_position.zig").Position;

pub fn build(a: std.mem.Allocator, trees: []const Tree, section: usize, paragraph: *const Paragraph, report: *const fields.Report, limit: usize) ![]Position {
    if (section >= trees.len) return error.InvalidPartOrdinal;
    if (paragraph.pieces != null or paragraph.protected_positions != null or paragraph.field_positions != null or paragraph.generated_id != null) return error.UnsupportedStructuralFieldEdit;
    const tree = &trees[section];
    const ranges = try @import("field_text_ranges.zig").build(a, trees, report);
    defer a.free(ranges);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    try @import("plain_paragraph_policy.zig").validateForCharacterFormat(tree, &paragraph.sites, locations, 1);
    const positions = try @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
    defer a.free(positions);
    var output: std.ArrayList(Position) = .empty;
    defer output.deinit(a);
    for (report.markers) |marker| {
        if (marker.section_ordinal != section) continue;
        if (try @import("paragraph_site_owner.zig").ancestor(tree, marker.element_index) != paragraph.template_element) continue;
        const begin = if (marker.kind == .begin) marker.element_index else report.markers[marker.matched_marker_index.?].element_index;
        const at = tree.elements[marker.element_index].start_tag.start;
        var unit: usize = 0;
        for (positions) |position| {
            if (position.source_start >= at) break;
            unit = position.end_unit;
        }
        if (output.items.len >= limit) return error.LimitExceeded;
        try output.append(a, .{ .element_index = marker.element_index, .begin_element = begin, .kind = marker.kind, .unit = unit });
    }
    return output.toOwnedSlice(a);
}

test "HWPX source field positions have zero width and follow current UTF16 text" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>B😀</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]Tree{tree};
    var report = try fields.inspect(a, &trees, .{});
    defer report.deinit();
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer current.deinit(a);
    const paragraph = &current.paragraphs[0];
    const original = try build(a, &trees, 0, paragraph, &report, 2);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 2), original.len);
    try std.testing.expectEqual(@as(usize, 3), original[0].unit);
    try std.testing.expectEqual(@as(usize, 6), original[1].unit);
    try std.testing.expectEqual(original[0].begin_element, original[1].begin_element);
    try std.testing.expectError(error.LimitExceeded, build(a, &trees, 0, paragraph, &report, 1));
    const changed = try a.dupe(u8, "X😀B😀");
    a.free(paragraph.sites.items[1].text);
    paragraph.sites.items[1].text = changed;
    const edited = try build(a, &trees, 0, paragraph, &report, 2);
    defer a.free(edited);
    try std.testing.expectEqual(@as(usize, 3), edited[0].unit);
    try std.testing.expectEqual(@as(usize, 9), edited[1].unit);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, inputs: []const Tree, value: *const Paragraph, linked: *const fields.Report) !void {
            const result = try build(allocator, inputs, 0, value, linked, 2);
            defer allocator.free(result);
        }
    }.run, .{ &trees, paragraph, &report });
    try std.testing.expectEqualStrings(xml, tree.source);
    const markers = @constCast(report.markers);
    const link = markers[1].matched_marker_index;
    markers[1].matched_marker_index = null;
    try std.testing.expectError(error.InvalidFieldLinks, build(a, &trees, 0, paragraph, &report, 2));
    markers[1].matched_marker_index = link;
    paragraph.generated_id = 9;
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, build(a, &trees, 0, paragraph, &report, 2));
    paragraph.generated_id = null;
}

test "HWPX source field positions bind all actual hyperlink and cross paragraph markers" {
    const a = std.testing.allocator;
    var marker_count: usize = 0;
    for ([_][]const u8{ "hyperlink", "issue144-fields-crossing-lineseg-boundary" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        const trees = [_]Tree{section.tree};
        var report = try fields.inspect(a, &trees, .{});
        defer report.deinit();
        var counters: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(session.options), &counters);
        defer current.deinit(a);
        var count: usize = 0;
        for (current.paragraphs) |*paragraph| {
            const items = try build(a, &trees, 0, paragraph, &report, 100);
            defer a.free(items);
            const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, paragraph);
            defer a.free(locations);
            const text_positions = try @import("paragraph_text_positions.zig").build(a, &section.tree, &paragraph.sites, locations, 1);
            defer a.free(text_positions);
            const length = if (text_positions.len == 0) 0 else text_positions[text_positions.len - 1].end_unit;
            for (items) |item| {
                const moves = try @import("field_split_plan.zig").build(a, items, item.unit, item.unit, length, 100);
                defer a.free(moves);
                try std.testing.expectEqual(items.len, moves.len);
            }
            count += items.len;
        }
        try std.testing.expectEqual(report.markers.len, count);
        marker_count += count;
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
    try std.testing.expectEqual(@as(usize, 12), marker_count);
}
