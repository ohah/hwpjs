//! 주석 직접 목록의 소유권만 관측합니다. 번호와 페이지 위치는 계산하지 않습니다.
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Context = struct { note_node: usize, list_node: usize, kind: enum { footnote, endnote } };

pub fn read(tree: *const Tree, paragraph: usize) !?Context {
    if (paragraph >= tree.elements.len) return error.InvalidPartTree;
    if (!tree.elements[paragraph].is(uri, "p")) return null;
    const list = tree.elements[paragraph].parent orelse return null;
    if (list >= paragraph) return error.InvalidPartTree;
    if (!tree.elements[list].is(uri, "subList")) return null;
    const note = tree.elements[list].parent orelse return null;
    if (note >= list) return error.InvalidPartTree;
    if (tree.elements[note].is(uri, "footNote")) return .{ .note_node = note, .list_node = list, .kind = .footnote };
    if (tree.elements[note].is(uri, "endNote")) return .{ .note_node = note, .list_node = list, .kind = .endnote };
    return null;
}
