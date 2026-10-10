//! 원본 조각에 객체가 있는지 선택합니다. 편집/저장 권한 검증은 호출자가 맡습니다.
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn has(tree: *const Tree, joined: *const Joined) bool {
    for (joined.pieces) |piece| {
        if (piece.template_element >= tree.elements.len) continue;
        var child = tree.elements[piece.template_element].first_child;
        while (child) |index| : (child = tree.elements[index].next_sibling) {
            if (!tree.elements[index].is(uri, "run")) continue;
            var content = tree.elements[index].first_child;
            while (content) |element| : (content = tree.elements[element].next_sibling) {
                if (@import("run_anchor.zig").kind(tree, element) != null) return true;
            }
        }
    }
    return false;
}
