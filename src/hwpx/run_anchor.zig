//! Structural source anchors only. Does not validate/render object payloads.
const trees = @import("xml_part_tree.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Kind = enum(u8) { table, picture, equation, rectangle, line, container, footnote, endnote, automatic_number, ole, ellipse, polygon, button, check_button, combo_box, radio_button, edit_box, connector_line, character_composition, conditional_object, dutmal, unknown_object = 21 };
pub fn isForm(value: Kind) bool {
    return switch (value) {
        .button, .check_button, .combo_box, .radio_button, .edit_box => true,
        else => false,
    };
}

pub fn kind(tree: *const trees.Tree, index: usize) ?Kind {
    if (index >= tree.elements.len) return null;
    const element = tree.elements[index];
    const run_index = element.parent orelse return null;
    const run = tree.elements[run_index];
    const paragraph_index = run.parent orelse return null;
    if (!run.is(uri, "run") or !tree.elements[paragraph_index].is(uri, "p")) return null;
    if (element.is(uri, "tbl")) return .table;
    if (element.is(uri, "pic")) return .picture;
    if (element.is(uri, "equation")) return .equation;
    if (element.is(uri, "rect")) return .rectangle;
    if (element.is(uri, "line")) return .line;
    if (element.is(uri, "connectLine")) return .connector_line;
    if (element.is(uri, "compose")) return .character_composition;
    if (element.is(uri, "dutmal")) return .dutmal;
    if (element.is(uri, "unknownObj")) return .unknown_object;
    if (element.is(uri, "container")) return .container;
    if (element.is(uri, "ole")) return .ole;
    if (element.is(uri, "ellipse")) return .ellipse;
    if (element.is(uri, "polygon")) return .polygon;
    if (element.is(uri, "btn")) return .button;
    if (element.is(uri, "checkBtn")) return .check_button;
    if (element.is(uri, "comboBox")) return .combo_box;
    if (element.is(uri, "radioBtn")) return .radio_button;
    if (element.is(uri, "edit")) return .edit_box;
    if (@import("run_switch_anchor.zig").supported(tree, index)) return .conditional_object;
    if (!element.is(uri, "ctrl")) return null;
    const child_index = element.first_child orelse return null;
    const child = tree.elements[child_index];
    if (child.next_sibling != null) return null;
    if (!gaps.empty(tree, index)) return null;
    if (child.is(uri, "footNote")) return .footnote;
    if (child.is(uri, "endNote")) return .endnote;
    if (@import("retained_auto_number.zig").supported(tree, child_index)) return .automatic_number;
    return null;
}

test "HWPX connector line anchor is distinct and requires exact direct run ownership" {
    const std = @import("std");
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:connectLine/><p:line/><x:connectLine/></p:run><p:connectLine/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(Kind.connector_line, kind(&tree, 3).?);
    try std.testing.expectEqual(Kind.line, kind(&tree, 4).?);
    try std.testing.expect(kind(&tree, 5) == null);
    try std.testing.expect(kind(&tree, 6) == null);
    try std.testing.expect(kind(&tree, tree.elements.len) == null);
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX dutmal anchor retains separate payload and rejects foreign or nonrun ownership" {
    const std = @import("std");
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:dutmal><p:mainText>본문</p:mainText><p:subText>덧말</p:subText></p:dutmal><x:dutmal/></p:run><p:dutmal/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var checked: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.name.local.equals("dutmal", false)) continue;
        if (checked == 0) try std.testing.expectEqual(Kind.dutmal, kind(&tree, index).?) else try std.testing.expect(kind(&tree, index) == null);
        checked += 1;
    }
    try std.testing.expectEqual(@as(usize, 3), checked);
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX composition anchor keeps empty and nonempty payload distinct from plain text" {
    const std = @import("std");
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:compose composeText='' charPrCnt='1'><p:charPr prIDRef='4294967295'/></p:compose><p:compose composeText='A😀'/><x:compose/></p:run><p:compose/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(Kind.character_composition, kind(&tree, 3).?);
    try std.testing.expectEqual(Kind.character_composition, kind(&tree, 5).?);
    try std.testing.expect(kind(&tree, 6) == null);
    try std.testing.expect(kind(&tree, 7) == null);
    try std.testing.expectEqualStrings(source, tree.source);
}
