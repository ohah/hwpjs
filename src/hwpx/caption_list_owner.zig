//! Exact direct caption list ownership shared by tables and pictures.
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Kind = enum { table, picture };
pub const Owner = struct { component_node: usize, caption_node: usize, list_node: usize };

pub fn resolve(tree: *const Tree, template: usize, comptime kind: Kind) !?Owner {
    if (template >= tree.elements.len or !fields.childIs(tree, template, "p")) return error.InvalidCaptionParagraphTemplate;
    const list = tree.elements[template].parent orelse return null;
    if (!fields.childIs(tree, list, "subList")) return null;
    const caption = tree.elements[list].parent orelse return null;
    if (!fields.childIs(tree, caption, "caption")) return null;
    const component = tree.elements[caption].parent orelse return null;
    if (!fields.childIs(tree, component, if (kind == .table) "tbl" else "pic")) return null;
    inline for (.{ .{ component, "caption", caption }, .{ caption, "subList", list } }) |link| {
        var missing: usize = 0;
        var duplicate: usize = 0;
        if (fields.uniqueChild(tree, link[0], link[1], &missing, &duplicate) != link[2] or duplicate != 0)
            return if (kind == .table) error.AmbiguousTableCaptionOwner else error.AmbiguousPictureCaptionOwner;
    }
    return .{ .component_node = component, .caption_node = caption, .list_node = list };
}
