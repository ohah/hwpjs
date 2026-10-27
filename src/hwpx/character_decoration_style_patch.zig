//! 선모양만 갱신하며 type/color/알 수 없는 속성과 자식은 보존합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Kind = @import("../model/character_line_style.zig").Kind;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, strike: bool, style: Kind, limit: usize) ![]u8 {
    if (strike and @import("../model/character_line_style.zig").fromXml(@tagName(style), true) == null) return error.UnsupportedCharacterLineStyle;
    const name = if (strike) "strikeout" else "underline";
    const source = try current(a, tree, node, strike);
    // NONE은 HWPX 취소선 활성 상태 자체입니다. style-only로 활성화하지 않습니다.
    if (strike and std.mem.eql(u8, source, "NONE")) {
        a.free(source);
        return error.InactiveCharacterStrikeStyle;
    }
    defer a.free(source);
    if (@import("../model/character_line_style.zig").fromXml(source, strike) == null) return error.UnsupportedCharacterLineStyle;
    if (@import("../model/character_line_style.zig").fromXml(source, strike) == style) return a.dupe(u8, tree.sourceOf(node));
    return @import("character_child_attribute_patch.zig").write(a, tree, node, name, "shape", @tagName(style), limit);
}
fn current(a: std.mem.Allocator, tree: *const Tree, node: usize, strike: bool) ![]u8 {
    const name = if (strike) "strikeout" else "underline";
    var found: ?usize = null;
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) if (tree.elements[index].is(@import("document_xml.zig").head_uri, name)) {
        if (found != null) return error.DuplicateCharacterDecoration;
        found = index;
    };
    const index = found orelse return error.MissingCharacterDecoration;
    const attr = (try tree.attributeValue(a, index, "", "shape")) orelse return error.MissingCharacterLineStyle;
    return attr.toUtf8(a, 4096);
}
pub fn matches(a: std.mem.Allocator, tree: *const Tree, node: usize, patch: @import("../model/document.zig").CharacterPropertyPatch) !bool {
    inline for (.{ .{ "underline_style", false }, .{ "strike_style", true } }) |entry| if (@field(patch, entry[0])) |style| {
        const value = current(a, tree, node, entry[1]) catch |err| {
            // 같은 batch의 기존 kind writer가 부재 자식을 생성합니다. style-only나 malformed 자식은 허용하지 않습니다.
            if (err == error.MissingCharacterDecoration and !entry[1] and patch.underline_kind != null and patch.underline_kind.? != .none) return false;
            return err;
        };
        defer a.free(value);
        if (@import("../model/character_line_style.zig").fromXml(value, entry[1]) != style) return false;
    };
    return true;
}
