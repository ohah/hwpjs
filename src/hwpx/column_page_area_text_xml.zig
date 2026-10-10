//! 단 선언과 쪽 영역을 같은 텍스트 사이트의 한 변경으로 출력합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Local = @import("text_metadata_fragment.zig").Local;

pub fn control(tree: *const Tree, element: usize) !usize {
    if (element >= tree.elements.len) return error.SourceBindingMismatch;
    if (tree.elements[element].is(@import("document_xml.zig").paragraph_uri, "colPr")) return @import("column_boundary_xml.zig").control(tree, element);
    return @import("page_area_text_xml.zig").control(tree, element);
}

fn writeControl(a: std.mem.Allocator, tree: *const Tree, element: usize, limit: usize) ![]u8 {
    return @import("xml_subtree_closure.zig").write(a, tree, try control(tree, element), limit);
}

pub fn writeManyFrom(a: std.mem.Allocator, tree: *const Tree, site: @import("text_sites.zig").Site, source: *const Tree, positions: []const Local, limit: usize) ![]u8 {
    return @import("text_metadata_fragment.zig").writeManyFrom(a, tree, site, source, positions, limit, writeControl);
}
