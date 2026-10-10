//! 현재 텍스트 투영으로 필드 마커 좌표를 재계산합니다. 원본 XML은 변경하지 않습니다.
const std = @import("std");
const Position = @import("field_position.zig").Position;
const Segment = @import("paragraph_text_positions.zig").Segment;

/// 모든 검사가 끝난 뒤 좌표를 게시하므로 실패 시 입력 배열은 유지됩니다.
pub fn refresh(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, owned: []Position, segments: []const Segment) !void {
    const units = try a.alloc(usize, owned.len);
    defer a.free(units);
    var previous_source: ?usize = null;
    var previous_unit: usize = 0;
    for (segments) |segment| {
        if (segment.kind != .text) return error.UnsupportedInlineControl;
        if (segment.start_unit != previous_unit or segment.end_unit < segment.start_unit) return error.InvalidFieldPositions;
        if (previous_source) |source| if (segment.source_start < source) return error.InvalidFieldPositions;
        previous_source = segment.source_start;
        previous_unit = segment.end_unit;
    }
    var cursor: usize = 0;
    var unit: usize = 0;
    for (owned, units, 0..) |marker, *result, index| {
        if (marker.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        if (index != 0 and marker.element_index <= owned[index - 1].element_index) return error.InvalidFieldPositions;
        const element = tree.elements[marker.element_index];
        const name = if (marker.kind == .begin) "fieldBegin" else "fieldEnd";
        if (!element.is(@import("document_xml.zig").paragraph_uri, name)) return error.SourceBindingMismatch;
        while (cursor < segments.len and segments[cursor].source_start < element.start_tag.start) : (cursor += 1) unit = segments[cursor].end_unit;
        result.* = unit;
    }
    for (owned, units) |*marker, unit_value| marker.unit = unit_value;
}

test "HWPX field position refresh updates Unicode units and rejects partial publication" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A😀</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var begin: usize = 0;
    var end: usize = 0;
    var text: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = index;
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldEnd")) end = index;
        if (element.is(@import("document_xml.zig").paragraph_uri, "t")) text = index;
    }
    var markers = [_]Position{
        .{ .element_index = begin, .begin_element = begin, .kind = .begin, .unit = 9 },
        .{ .element_index = end, .begin_element = begin, .kind = .end, .unit = 9 },
    };
    const segments = [_]Segment{.{ .kind = .text, .index = 0, .source_start = tree.elements[text].start_tag.start, .start_unit = 0, .end_unit = 3 }};
    try refresh(a, &tree, &markers, &segments);
    try std.testing.expectEqual(@as(usize, 0), markers[0].unit);
    try std.testing.expectEqual(@as(usize, 3), markers[1].unit);
    markers[0].unit = 9;
    markers[1].element_index = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, refresh(a, &tree, &markers, &segments));
    try std.testing.expectEqual(@as(usize, 9), markers[0].unit);
    try std.testing.expectEqual(@as(usize, 3), markers[1].unit);
}
