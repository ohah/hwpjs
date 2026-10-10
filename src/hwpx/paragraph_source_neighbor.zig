//! 원본 XML의 직접 소유자 안에서 인접 문단을 선택합니다.
//! 현재 편집 모델의 생성 문단 선택이나 병합 허용 판정은 맡지 않습니다.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn next(tree: *const Tree, paragraph: usize) !?usize {
    if (paragraph >= tree.elements.len) return error.InvalidParagraphElement;
    const source = tree.elements[paragraph];
    if (!source.is(uri, "p") or source.parent == null) return error.InvalidParagraphElement;
    const sibling = source.next_sibling orelse return null;
    if (sibling <= paragraph or sibling >= tree.elements.len or tree.elements[sibling].parent != source.parent)
        return error.SourceBindingMismatch;
    // 문단 사이의 다른 직접 요소를 넘어가며 병합 대상으로 추정하지 않습니다.
    if (!tree.elements[sibling].is(uri, "p")) return error.InvalidParagraphAdjacency;
    return sibling;
}

test "HWPX source neighbor selects root siblings without crossing note owners" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
    defer current.deinit(a);
    try std.testing.expectEqual(@as(usize, 6), current.paragraphs.len);
    try std.testing.expectEqual(@as(?usize, current.paragraphs[3].template_element), try next(&section.tree, current.paragraphs[0].template_element));
    try std.testing.expectEqual(@as(?usize, 3), try @import("paragraph_current_neighbor.zig").next(&section.tree, &current, 0));
    for (1..current.paragraphs.len) |index|
        try std.testing.expectEqual(@as(?usize, null), try @import("paragraph_current_neighbor.zig").next(&section.tree, &current, index));
    for (current.paragraphs[1..]) |paragraph|
        try std.testing.expectEqual(@as(?usize, null), try next(&section.tree, paragraph.template_element));
    try std.testing.expectError(error.InvalidParagraphElement, next(&section.tree, section.tree.elements.len));
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "HWPX source neighbor refuses intervening elements and malformed binding" {
    const std = @import("std");
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p/><p:other/><p:p/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidParagraphElement, next(&tree, 0));
    try std.testing.expectError(error.InvalidParagraphAdjacency, next(&tree, 1));
    const original = tree.elements[1].next_sibling;
    tree.elements[1].next_sibling = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, next(&tree, 1));
    tree.elements[1].next_sibling = 1;
    try std.testing.expectError(error.SourceBindingMismatch, next(&tree, 1));
    tree.elements[1].next_sibling = original;
}
