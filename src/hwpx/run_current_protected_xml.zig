//! 보호 요소 귀속을 적용한 문단에서 run 원문을 namespace와 함께 추출합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    if (run >= tree.elements.len or tree.elements[run].parent != paragraph.template_element or !tree.elements[run].is(uri, "run")) return error.SourceBindingMismatch;
    var ordinal: usize = 0;
    var child = tree.elements[paragraph.template_element].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (index == run) break;
        if (tree.elements[index].is(uri, "run")) ordinal += 1;
    }
    const xml = try @import("paragraph_split_xml.zig").writeProtected(a, tree, paragraph, options, limit);
    defer a.free(xml);
    const root = tree.elements[0];
    const close = root.end_tag orelse return error.InvalidPartKind;
    const wrapper = try std.mem.concat(a, u8, &.{ tree.source[root.start_tag.start..root.start_tag.end], xml, tree.source[close.start..close.end] });
    defer a.free(wrapper);
    var normalized = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{ .max_xml_bytes = wrapper.len });
    defer normalized.deinit(a);
    const owner = normalized.elements[0].first_child orelse return error.SourceBindingMismatch;
    var output = normalized.elements[owner].first_child;
    var count: usize = 0;
    while (output) |index| : (output = normalized.elements[index].next_sibling) {
        if (!normalized.elements[index].is(uri, "run")) continue;
        if (count == ordinal) return @import("xml_subtree_closure.zig").write(a, &normalized, index, limit);
        count += 1;
    }
    return error.SourceBindingMismatch;
}
