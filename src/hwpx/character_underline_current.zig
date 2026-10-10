//! Resolve current underline intent against the immutable source header.
const Kind = @import("../model/document.zig").CharacterUnderlineKind;
const Tree = @import("xml_part_tree.zig").Tree;

pub fn read(session: *const @import("editor_session.zig").Session, tree: *const Tree, id: u32) !?Kind {
    var source_id = id;
    for (session.character_resources.entries.items) |entry| if (entry.id == id) {
        if (entry.properties.underline_kind) |kind| return kind;
        source_id = entry.source_id;
        break;
    };
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(tree, index)) continue;
        const shape = try @import("character_shape_display.zig").read(session.allocator, tree, index, 4096);
        if (shape.id != source_id) continue;
        var values = try @import("character_underline_values.zig").read(session.allocator, tree, index, 4096);
        defer values.deinit(session.allocator);
        return if (values.present) values.kind else .none;
    }
    return error.InvalidCharacterShapeReference;
}
