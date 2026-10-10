//! Presence flags only; outline/shadow values and rendering are separate contracts.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;
pub const Flags = @import("../model/character_effect_flags.zig").Flags;

pub fn read(tree: *const Tree, index: usize) !Flags {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    if (!tree.elements[index].is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    var result: Flags = .{};
    var child = tree.elements[index].first_child;
    while (child) |current| : (child = tree.elements[current].next_sibling) {
        const element = tree.elements[current];
        inline for (.{ .{ "emboss", "emboss" }, .{ "engrave", "engrave" }, .{ "supscript", "superscript" }, .{ "subscript", "subscript" } }) |entry| {
            if (element.is(uri, entry[0])) {
                if (@field(result, entry[1])) return error.DuplicateCharacterShapeFlag;
                @field(result, entry[1]) = true;
            }
        }
    }
    return result;
}

test "HWPX character effects use direct header ownership and preserve conflicting flags" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr><h:emboss/><h:engrave/><h:supscript/><h:subscript/></h:charPr><h:charPr><f:emboss/><f:holder><h:subscript/></f:holder></h:charPr><h:charPr><h:emboss/><h:emboss/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Flags{ .emboss = true, .engrave = true, .superscript = true, .subscript = true }, try read(&tree, 1));
    try std.testing.expectEqualDeep(Flags{}, try read(&tree, 6));
    try std.testing.expectError(error.DuplicateCharacterShapeFlag, read(&tree, 10));
    try std.testing.expectError(error.InvalidElementIndex, read(&tree, tree.elements.len));
    try std.testing.expectError(error.InvalidCharacterShapeElement, read(&tree, 0));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX character effects display integration covers every presence combination" {
    const a = std.testing.allocator;
    for (0..16) |bits| {
        const source = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr>{s}{s}{s}{s}</h:charPr></h:head>", .{
            if (bits & 1 != 0) "<h:emboss/>" else "",
            if (bits & 2 != 0) "<h:engrave/>" else "",
            if (bits & 4 != 0) "<h:supscript/>" else "",
            if (bits & 8 != 0) "<h:subscript/>" else "",
        });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
        defer tree.deinit(a);
        const shape = try @import("character_shape_display.zig").read(a, &tree, 1, 64);
        try std.testing.expectEqualDeep(Flags{ .emboss = bits & 1 != 0, .engrave = bits & 2 != 0, .superscript = bits & 4 != 0, .subscript = bits & 8 != 0 }, shape.effects);
    }
}
