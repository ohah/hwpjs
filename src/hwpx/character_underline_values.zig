//! Direct header underline values; absence is distinct from explicit NONE.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;
pub const Kind = @import("../model/document.zig").CharacterUnderlineKind;
pub const Values = struct {
    present: bool = false,
    kind: ?Kind = null,
    shape: ?[]u8 = null,
    color: ?[]u8 = null,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        if (self.shape) |value| a.free(value);
        if (self.color) |value| a.free(value);
        self.* = .{};
    }
};
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !Values {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    if (!tree.elements[node].is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    var result: Values = .{};
    errdefer result.deinit(a);
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "underline")) continue;
        if (result.present) return error.DuplicateCharacterUnderline;
        result.present = true;
        if (try tree.attributeValue(a, index, "", "type")) |raw| {
            const text = try raw.toUtf8(a, limit);
            defer a.free(text);
            result.kind = if (std.mem.eql(u8, text, "NONE")) .none else if (std.mem.eql(u8, text, "BOTTOM")) .bottom else if (std.mem.eql(u8, text, "CENTER")) .center else if (std.mem.eql(u8, text, "TOP")) .top else return error.InvalidCharacterUnderlineKind;
        }
        if (try tree.attributeValue(a, index, "", "shape")) |raw| result.shape = try raw.toUtf8(a, limit);
        if (try tree.attributeValue(a, index, "", "color")) |raw| result.color = try raw.toUtf8(a, limit);
    }
    return result;
}
