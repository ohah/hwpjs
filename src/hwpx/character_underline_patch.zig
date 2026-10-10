//! Position changes preserve existing underline shape, color, and extensions.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;
const values = @import("character_underline_values.zig");
pub const Kind = values.Kind;
pub const creation_shape = "SOLID";
pub const creation_color = "#000000";
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, kind: Kind, limit: usize) ![]u8 {
    var current = try values.read(a, tree, node, 4096);
    defer current.deinit(a);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    if (current.kind == kind or (!current.present and kind == .none)) return a.dupe(u8, fragment);
    const text = switch (kind) {
        .none => "NONE",
        .bottom => "BOTTOM",
        .center => "CENTER",
        .top => "TOP",
    };
    if (current.present) return attributePatch(a, tree, node, "type", text, limit);
    return create(a, tree, node, text, creation_color, limit);
}
pub fn writeColor(a: std.mem.Allocator, tree: *const Tree, node: usize, color: u32, limit: usize) ![]u8 {
    const rgb = @import("../model/rgb_color.zig");
    try rgb.validate(color);
    var current = try values.read(a, tree, node, 4096);
    defer current.deinit(a);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    if (current.color) |text| if (rgb.xml(text) == color) return a.dupe(u8, fragment);
    const text = try rgb.format(a, color);
    defer a.free(text);
    if (current.present) return attributePatch(a, tree, node, "color", text, limit);
    return create(a, tree, node, "NONE", text, limit);
}
fn attributePatch(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8, text: []const u8, limit: usize) ![]u8 {
    return @import("character_child_attribute_patch.zig").write(a, tree, node, "underline", name, text, limit) catch |err| return if (err == error.MissingCharacterChild) error.MissingCharacterUnderline else err;
}
fn create(a: std.mem.Allocator, tree: *const Tree, node: usize, kind: []const u8, color: []const u8, limit: usize) ![]u8 {
    const flag = try std.fmt.allocPrint(a, "<underline xmlns=\"{s}\" type=\"{s}\" shape=\"{s}\" color=\"{s}\"/>", .{ uri, kind, creation_shape, color });
    defer a.free(flag);
    const following = [_][]const u8{ "strikeout", "outline", "shadow", "emboss", "engrave", "supscript", "subscript" };
    return @import("character_child_insert.zig").write(a, tree, node, flag, &following, limit);
}
