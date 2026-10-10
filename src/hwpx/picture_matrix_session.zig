const std = @import("std");
const editor = @import("editor_session.zig");
const fields = @import("table_xml_fields.zig");
pub fn set(session: *editor.Session, section_index: usize, node: usize, values: [6]f64) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    if (@import("picture_matrix_fields.zig").kind(tree, node) == null) return error.InvalidPictureMatrixNode;
    const rendering = tree.elements[node].parent orelse return error.InvalidPictureMatrixParent;
    if (!fields.childIs(tree, rendering, "renderingInfo")) return error.InvalidPictureMatrixParent;
    const picture = tree.elements[rendering].parent orelse return error.InvalidPictureMatrixOwner;
    if (!fields.childIs(tree, picture, "pic")) return error.InvalidPictureMatrixOwner;
    for (values) |value| if (!std.math.isFinite(value)) return error.NonFiniteXmlFloatAttribute;
    const current = try @import("picture_matrix_edit_values.zig").read(session.allocator, tree, &section.picture_matrices, node);
    var changed = false;
    for (current, values) |old, next| if (old == null or old.? != next) {
        changed = true;
    };
    if (changed and try @import("picture_dimension_values.zig").protection(session.allocator, tree, picture) == true) return error.PictureSizeProtected;
    return @import("picture_matrix_edit_values.zig").set(session.allocator, tree, &section.picture_matrices, node, values, session.options.max_xml_bytes);
}
