//! 현재 필드 텍스트와 폭 없는 마커 귀속을 한 임시 분할 초안으로 소유합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const text_split = @import("paragraph_split_text.zig");
const marker_plan = @import("field_split_plan.zig");

pub const Draft = struct {
    text: text_split.Draft,
    markers: []marker_plan.Move,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.text.deinit(a);
        a.free(self.markers);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, paragraph: *const Paragraph, report: *const @import("field_markers.zig").Report, start: u32, end: u32, max_bytes: usize, max_markers: usize) !Draft {
    if (paragraph.character_styles != null) return error.UnsupportedStructuralFieldEdit;
    const markers = try @import("field_source_positions.zig").build(a, trees, section, paragraph, report, max_markers);
    defer a.free(markers);
    if (markers.len == 0) return error.MissingFieldMarkers;
    const tree = &trees[section];
    try @import("paragraph_structure_policy.zig").validate(a, tree, paragraph.template_element);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
    defer a.free(positions);
    for (positions) |position| if (position.kind != .text) return error.UnsupportedInlineControl;
    try @import("paragraph_text_positions.zig").validateRange(positions, start, end);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, start);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, end);
    var text = try text_split.fromPositions(a, &paragraph.sites, positions, paragraph.template_element, start, end, max_bytes);
    errdefer text.deinit(a);
    const length = positions[positions.len - 1].end_unit;
    const moves = try marker_plan.build(a, markers, start, end, length, max_markers);
    return .{ .text = text, .markers = moves };
}

test "HWPX field split draft composes UTF16 text and markers through all allocation failures" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='7'><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A😀B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer current.deinit(a);
    const paragraph = &current.paragraphs[0];
    var draft = try prepare(a, &trees, 0, paragraph, &report, 1, 1, 100, 2);
    defer draft.deinit(a);
    try std.testing.expectEqualStrings("A", draft.text.left.items[0].text);
    try std.testing.expectEqualStrings("😀B", draft.text.right.items[0].text);
    try std.testing.expectEqual(.left, draft.markers[0].side);
    try std.testing.expectEqual(.right, draft.markers[1].side);
    try std.testing.expectEqual(@as(usize, 3), draft.markers[1].unit);
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &trees, 0, paragraph, &report, 2, 2, 100, 2));
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, &trees, 0, paragraph, &report, 3, 1, 100, 2));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &trees, 0, paragraph, &report, 1, 1, 1, 2));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &trees, 0, paragraph, &report, 1, 1, 100, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, inputs: []const Tree, value: *const Paragraph, linked: *const @import("field_markers.zig").Report) !void {
            var candidate = try prepare(allocator, inputs, 0, value, linked, 1, 1, 100, 2);
            defer candidate.deinit(allocator);
        }
    }.run, .{ &trees, paragraph, &report });
    try std.testing.expectEqualStrings("A😀B", paragraph.sites.items[0].text);
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "HWPX field split draft binds all actual field paragraphs and marker boundaries" {
    const a = std.testing.allocator;
    var paragraph_count: usize = 0;
    var boundary_count: usize = 0;
    for ([_][]const u8{ "hyperlink", "issue144-fields-crossing-lineseg-boundary" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        const trees = [_]Tree{section.tree};
        var report = try @import("field_markers.zig").inspect(a, &trees, .{});
        defer report.deinit();
        var counters: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(session.options), &counters);
        defer current.deinit(a);
        for (current.paragraphs) |*paragraph| {
            const positions = try @import("field_source_positions.zig").build(a, &trees, 0, paragraph, &report, 100);
            defer a.free(positions);
            if (positions.len == 0) continue;
            paragraph_count += 1;
            for (positions) |position| {
                const at = std.math.cast(u32, position.unit) orelse return error.LimitExceeded;
                var draft = try prepare(a, &trees, 0, paragraph, &report, at, at, 4_000_000, 100);
                defer draft.deinit(a);
                try std.testing.expectEqual(positions.len, draft.markers.len);
                for (paragraph.sites.items, draft.text.left.items, draft.text.right.items) |source, left, right| {
                    try std.testing.expectEqual(source.text.len, left.text.len + right.text.len);
                    try std.testing.expectEqualStrings(source.text[0..left.text.len], left.text);
                    try std.testing.expectEqualStrings(source.text[left.text.len..], right.text);
                    try std.testing.expectEqual(source.element_index, left.element_index);
                    try std.testing.expectEqual(source.element_index, right.element_index);
                }
                boundary_count += 1;
            }
        }
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
    try std.testing.expectEqual(@as(usize, 7), paragraph_count);
    try std.testing.expectEqual(@as(usize, 12), boundary_count);
}
