//! 현재 소유 목록을 원본 provenance에 대조합니다. 이동된 원본 개체를 다시 표시하지 않습니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Segment = @import("paragraph_text_positions.zig").Segment;
const Tree = @import("xml_part_tree.zig").Tree;

pub fn text(a: std.mem.Allocator, tree: *const Tree, paragraph: *const model.Paragraph, max_bytes: usize) ![]u8 {
    const segments = try build(a, tree, paragraph);
    defer a.free(segments);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (segments) |segment| {
        const value = @import("paragraph_text_positions.zig").segmentText(&paragraph.sites, segment);
        if (value.len > max_bytes -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, value);
    }
    return output.toOwnedSlice(a);
}

pub fn side(a: std.mem.Allocator, segments: []const Segment, start: u32, end: u32, right: bool) ![]model.ProtectedPosition {
    try @import("paragraph_text_positions.zig").validateRange(segments, start, end);
    var output: std.ArrayList(model.ProtectedPosition) = .empty;
    defer output.deinit(a);
    for (segments) |segment| {
        if (segment.kind == .text or (segment.start_unit >= end) != right) continue;
        try output.append(a, .{ .element_index = segment.index, .kind = if (segment.kind == .anchor) .anchor else .tab, .unit = if (right) segment.start_unit - end else segment.start_unit });
    }
    return output.toOwnedSlice(a);
}

pub fn build(a: std.mem.Allocator, tree: *const Tree, paragraph: *const model.Paragraph) ![]Segment {
    if (paragraph.joined()) |view| {
        if (@import("paragraph_joined_anchor_mode.zig").has(tree, &view)) {
            if (paragraph.protected_positions) |owned| return @import("paragraph_joined_positions.zig").buildOwnedAnchors(a, tree, &view, owned);
            return @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, &view);
        }
        if (paragraph.protected_positions) |owned| return @import("paragraph_joined_positions.zig").buildOwnedTabs(a, tree, &view, owned);
        return @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &view);
    }
    return buildSingle(a, tree, paragraph);
}

/// 조각 어댑터 전용입니다. 병합 위치 투영의 재귀 진입을 피합니다.
pub fn buildSingle(a: std.mem.Allocator, tree: *const Tree, paragraph: *const model.Paragraph) ![]Segment {
    if (paragraph.pieces != null) return error.SourceBindingMismatch;
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    const original = try @import("anchor_paragraph_edit.zig").segments(a, tree, &paragraph.sites, locations, 1);
    defer a.free(original);
    const protected = paragraph.protected_positions orelse return a.dupe(Segment, original);
    var owned: std.AutoHashMapUnmanaged(usize, model.ProtectedPosition) = .empty;
    defer owned.deinit(a);
    for (protected, 0..) |item, index| {
        if (index != 0 and item.unit <= protected[index - 1].unit) return error.SourceBindingMismatch;
        const entry = try owned.getOrPut(a, item.element_index);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = item;
    }
    var output: std.ArrayList(Segment) = .empty;
    defer output.deinit(a);
    var cursor: usize = 0;
    var matched: usize = 0;
    for (original) |segment| {
        if (segment.kind != .text) {
            const item = owned.get(segment.index) orelse continue;
            if (item.unit != cursor or (item.kind == .anchor) != (segment.kind == .anchor)) return error.SourceBindingMismatch;
            matched += 1;
        }
        var current = segment;
        current.start_unit = cursor;
        cursor = std.math.add(usize, cursor, segment.end_unit - segment.start_unit) catch return error.LimitExceeded;
        current.end_unit = cursor;
        try output.append(a, current);
    }
    if (matched != protected.len) return error.SourceBindingMismatch;
    return output.toOwnedSlice(a);
}

test "HWPX current protected positions omit moved anchors and reject forged source identity" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:pic/><p:t>B</p:t><p:line/><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var draft = try @import("paragraph_split_text.zig").prepareAnchored(a, &tree, &sites, locations, 1, 4, 4, 1000);
    defer draft.deinit(a);
    const moves = try @import("anchor_split_plan.zig").build(a, &tree, &sites, locations, 1, 4, 4);
    defer a.free(moves);
    var retained = [_]model.ProtectedPosition{.{ .element_index = moves[1].element_index, .unit = 1, .kind = .anchor }};
    var paragraph: model.Paragraph = .{ .template_element = draft.paragraph_element, .source_ordinal = null, .generated_id = 2, .sites = draft.right, .protected_positions = &retained };
    const segments = try build(a, &tree, &paragraph);
    defer a.free(segments);
    var spelling: std.ArrayList(u8) = .empty;
    defer spelling.deinit(a);
    for (segments) |segment| try spelling.appendSlice(a, @import("paragraph_text_positions.zig").segmentText(&paragraph.sites, segment));
    try std.testing.expectEqualStrings("B\xef\xbf\xbcC", spelling.items);
    const output = try @import("paragraph_split_xml.zig").writeProtected(a, &tree, &paragraph, .{}, 10000);
    defer a.free(output);
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, output, "<p:pic/>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:line/>"));
    paragraph.protected_positions = &.{};
    const empty = try build(a, &tree, &paragraph);
    defer a.free(empty);
    for (empty) |segment| try std.testing.expectEqual(.text, segment.kind);
    const empty_xml = try @import("paragraph_split_xml.zig").writeProtected(a, &tree, &paragraph, .{}, 10000);
    defer a.free(empty_xml);
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, empty_xml, "<p:pic/>"));
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, empty_xml, "<p:line/>"));
    paragraph.protected_positions = null;
    const inherited = try build(a, &tree, &paragraph);
    defer a.free(inherited);
    var inherited_count: usize = 0;
    for (inherited) |segment| if (segment.kind == .anchor) {
        inherited_count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), inherited_count);
    var duplicate = [_]model.ProtectedPosition{ retained[0], retained[0] };
    duplicate[1].unit = 2;
    paragraph.protected_positions = &duplicate;
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &tree, &paragraph));
    paragraph.protected_positions = &retained;
    retained[0].element_index = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &tree, &paragraph));
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_split_xml.zig").writeProtected(a, &tree, &paragraph, .{}, 10000));
    retained[0].element_index = moves[1].element_index;
    retained[0].unit = 2;
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &tree, &paragraph));
    retained[0].unit = 1;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, current: *const model.Paragraph) !void {
            const result = try build(allocator, source, current);
            defer allocator.free(result);
            const serialized = try @import("paragraph_split_xml.zig").writeProtected(allocator, source, current, .{}, 10000);
            defer allocator.free(serialized);
        }
    }.run, .{ &tree, &paragraph });
    try std.testing.expectEqualStrings(xml, tree.source);
}
