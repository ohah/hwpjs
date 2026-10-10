//! Resolve strike intent without modifying immutable header resources.
const Tree = @import("xml_part_tree.zig").Tree;

pub fn read(session: *const @import("editor_session.zig").Session, tree: *const Tree, id: u32) !bool {
    var source_id = id;
    for (session.character_resources.entries.items) |entry| if (entry.id == id) {
        if (entry.properties.strike_enabled) |enabled| return enabled;
        source_id = entry.source_id;
        break;
    };
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(tree, index)) continue;
        const shape = try @import("character_shape_display.zig").read(session.allocator, tree, index, 4096);
        if (shape.id != source_id) continue;
        var values = (try @import("character_strike_values.zig").read(session.allocator, tree, index, 4096)) orelse return false;
        defer values.deinit(session.allocator);
        const raw = values.shape orelse return error.UnsupportedCharacterStrikeShape;
        const kind = @import("line_style_values.zig").typeIndex(raw) orelse return error.UnsupportedCharacterStrikeShape;
        return kind != 0;
    }
    return error.InvalidCharacterShapeReference;
}
