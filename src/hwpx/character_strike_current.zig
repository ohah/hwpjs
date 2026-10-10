//! Resolve strike intent without modifying immutable header resources.
const Tree = @import("xml_part_tree.zig").Tree;
pub const Intent = union(enum) { enabled: bool, source_id: u32 };

pub fn intent(session: *const @import("editor_session.zig").Session, id: u32) Intent {
    for (session.character_resources.entries.items) |entry| if (entry.id == id) {
        if (entry.properties.strike_enabled) |enabled| return .{ .enabled = enabled };
        return .{ .source_id = entry.source_id };
    };
    return .{ .source_id = id };
}

pub fn read(session: *const @import("editor_session.zig").Session, tree: *const Tree, id: u32) !bool {
    const source_id = switch (intent(session, id)) {
        .enabled => |enabled| return enabled,
        .source_id => |source| source,
    };
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(tree, index)) continue;
        const shape = try @import("character_shape_display.zig").read(session.allocator, tree, index, 4096);
        if (shape.id != source_id) continue;
        return readNode(session.allocator, tree, index);
    }
    return error.InvalidCharacterShapeReference;
}

pub fn readNode(a: @import("std").mem.Allocator, tree: *const Tree, index: usize) !bool {
    var values = (try @import("character_strike_values.zig").read(a, tree, index, 4096)) orelse return false;
    defer values.deinit(a);
    const raw = values.shape orelse return error.UnsupportedCharacterStrikeShape;
    const kind = @import("line_style_values.zig").typeIndex(raw) orelse return error.UnsupportedCharacterStrikeShape;
    return kind != 0;
}
