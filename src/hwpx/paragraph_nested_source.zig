//! 부모 writer가 보존한 중첩 원문을 원본 출현 순서에 연결합니다.
//! 임의 외부 XML의 이동·재배열을 인증하는 파서는 아닙니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;

/// 검증된 현재 객체 목록의 순서로 보존된 내부 원문의 위치를 구합니다.
/// 소유하지 않은 객체의 내부 본문은 이 조회 대상이 아닙니다.
pub fn offsetOwned(tree: *const Tree, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition, child: usize, rendered: []const u8) !usize {
    if (child >= tree.elements.len) return error.SourceBindingMismatch;
    const inner = tree.elements[child];
    const raw = tree.sourceOf(child);
    var expected: usize = 0;
    var ordinal: ?usize = null;
    for (owned) |item| {
        if (item.kind != .anchor) continue;
        if (item.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        const outer = tree.elements[item.element_index];
        if (inner.start_tag.start > outer.start_tag.start and inner.end <= outer.end) {
            if (ordinal != null) return error.SourceBindingMismatch;
            ordinal = std.math.add(usize, expected, std.mem.count(u8, tree.source[outer.start_tag.start..inner.start_tag.start], raw)) catch return error.LimitExceeded;
        }
        expected = std.math.add(usize, expected, std.mem.count(u8, tree.sourceOf(item.element_index), raw)) catch return error.LimitExceeded;
    }
    const selected = ordinal orelse return error.SourceBindingMismatch;
    return occurrence(rendered, raw, expected, selected);
}

/// 병합 writer가 원본 조각 순서로 보존한 중첩 원문만 연결합니다.
pub fn offsetJoined(tree: *const Tree, joined: *const @import("paragraph_joined_values.zig").Joined, child: usize, rendered: []const u8) !usize {
    try joined.validate();
    if (child >= tree.elements.len) return error.SourceBindingMismatch;
    const inner = tree.elements[child];
    const raw = tree.sourceOf(child);
    var expected: usize = 0;
    var ordinal: ?usize = null;
    for (joined.pieces) |piece| {
        if (piece.template_element >= tree.elements.len or piece.output != .current_runs or piece.template_only) return error.SourceBindingMismatch;
        const outer = tree.elements[piece.template_element];
        if (inner.start_tag.start > outer.start_tag.start and inner.end <= outer.end) {
            if (ordinal != null) return error.SourceBindingMismatch;
            ordinal = std.math.add(usize, expected, std.mem.count(u8, tree.source[outer.start_tag.start..inner.start_tag.start], raw)) catch return error.LimitExceeded;
        }
        expected = std.math.add(usize, expected, std.mem.count(u8, tree.sourceOf(piece.template_element), raw)) catch return error.LimitExceeded;
    }
    const selected = ordinal orelse return error.SourceBindingMismatch;
    return occurrence(rendered, raw, expected, selected);
}

pub fn offset(tree: *const Tree, parent: usize, child: usize, rendered: []const u8) !usize {
    if (parent >= tree.elements.len or child >= tree.elements.len) return error.SourceBindingMismatch;
    const outer = tree.elements[parent];
    const inner = tree.elements[child];
    if (inner.start_tag.start <= outer.start_tag.start or inner.end > outer.end) return error.SourceBindingMismatch;
    const raw = tree.sourceOf(child);
    const original = tree.sourceOf(parent);
    const expected = std.mem.count(u8, original, raw);
    const ordinal = std.mem.count(u8, tree.source[outer.start_tag.start..inner.start_tag.start], raw);
    return occurrence(rendered, raw, expected, ordinal);
}

// 원본 소유 범위 선택과 출력 원문 출현 검증의 책임을 분리합니다.
fn occurrence(rendered: []const u8, raw: []const u8, expected: usize, ordinal: usize) !usize {
    if (raw.len == 0 or expected == 0 or ordinal >= expected or std.mem.count(u8, rendered, raw) != expected) return error.SourceBindingMismatch;
    var cursor: usize = 0;
    for (0..ordinal + 1) |index| {
        const found = std.mem.indexOfPos(u8, rendered, cursor, raw) orelse return error.SourceBindingMismatch;
        if (index == ordinal) return found;
        cursor = found + raw.len;
    }
    return error.SourceBindingMismatch;
}

test "HWPX nested source occurrence rejects empty and out of range identity" {
    try std.testing.expectEqual(@as(usize, 3), try occurrence("xA-xA", "xA", 2, 1));
    try std.testing.expectError(error.SourceBindingMismatch, occurrence("xA", "", 1, 0));
    try std.testing.expectError(error.SourceBindingMismatch, occurrence("xA", "xA", 0, 0));
    try std.testing.expectError(error.SourceBindingMismatch, occurrence("xA", "xA", 1, 1));
    try std.testing.expectError(error.SourceBindingMismatch, occurrence("xA", "xA", 1, std.math.maxInt(usize)));
    try std.testing.expectError(error.SourceBindingMismatch, occurrence("xA-xA", "xA", 1, 0));
}

test "HWPX nested source occurrence distinguishes duplicate XML and refuses missing or extra copies" {
    const a = std.testing.allocator;
    const child_xml = "<p:p><p:run><p:t>A</p:t></p:run></p:p>";
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:rect><p:subList>" ++ child_xml ++ child_xml ++ "</p:subList></p:rect></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var paragraphs: [3]usize = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
        if (count >= paragraphs.len) return error.UnexpectedParagraphCount;
        paragraphs[count] = index;
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 3), count);
    const raw = tree.sourceOf(paragraphs[0]);
    const first = try offset(&tree, paragraphs[0], paragraphs[1], raw);
    const second = try offset(&tree, paragraphs[0], paragraphs[2], raw);
    try std.testing.expectEqual(first + child_xml.len, second);
    const shifted = try std.mem.concat(a, u8, &.{ "<!--prefix-->", raw });
    defer a.free(shifted);
    try std.testing.expectEqual(second + "<!--prefix-->".len, try offset(&tree, paragraphs[0], paragraphs[2], shifted));
    try std.testing.expectError(error.SourceBindingMismatch, offset(&tree, paragraphs[0], paragraphs[2], child_xml));
    const extra = try std.mem.concat(a, u8, &.{ raw, child_xml });
    defer a.free(extra);
    try std.testing.expectError(error.SourceBindingMismatch, offset(&tree, paragraphs[0], paragraphs[2], extra));
    try std.testing.expectError(error.SourceBindingMismatch, offset(&tree, paragraphs[1], paragraphs[2], raw));
    try std.testing.expectError(error.SourceBindingMismatch, offset(&tree, paragraphs[0], tree.elements.len, raw));
}
