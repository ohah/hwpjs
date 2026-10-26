//! Read current color intent or immutable source; no serialized color cache.
const Tree = @import("xml_part_tree.zig").Tree;
pub fn read(session: *const @import("editor_session.zig").Session, tree: *const Tree, id: u32) !?u32 {
    var source_id = id;
    for (session.character_resources.entries.items) |entry| if (entry.id == id) {
        if (entry.properties.strike_color) |color| return color;
        source_id = entry.source_id;
        break;
    };
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(tree, index)) continue;
        const shape = try @import("character_shape_display.zig").read(session.allocator, tree, index, 4096);
        if (shape.id != source_id) continue;
        var value = (try @import("character_strike_values.zig").read(session.allocator, tree, index, 4096)) orelse return null;
        defer value.deinit(session.allocator);
        const token = value.shape orelse return error.UnsupportedCharacterStrikeShape;
        _ = @import("line_style_values.zig").typeIndex(token) orelse return error.UnsupportedCharacterStrikeShape;
        return if (value.color) |color| @import("../model/rgb_color.zig").xml(color) else null;
    }
    return error.InvalidCharacterShapeReference;
}
