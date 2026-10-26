//! Change an existing strike color without creating a strike or changing shape.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, color: u32, limit: usize) ![]u8 {
    try @import("../model/rgb_color.zig").validate(color);
    var value = (try @import("character_strike_values.zig").read(a, tree, node, 4096)) orelse return error.MissingCharacterStrikeColorField;
    defer value.deinit(a);
    const shape = value.shape orelse return error.UnsupportedCharacterStrikeShape;
    _ = @import("line_style_values.zig").typeIndex(shape) orelse return error.UnsupportedCharacterStrikeShape;
    const text = try @import("../model/rgb_color.zig").format(a, color);
    defer a.free(text);
    return @import("character_child_attribute_patch.zig").write(a, tree, node, "strikeout", "color", text, limit);
}
