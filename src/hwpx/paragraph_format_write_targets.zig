//! Addresses both known representations; never silently edit only one branch.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");
const selection = @import("compatibility_selection.zig");
const children = @import("paragraph_display_children.zig");
pub const unit_char_uri = "http://www.hancom.co.kr/hwpml/2016/HwpUnitChar";
pub const Targets = struct { nodes: [2]usize = undefined, len: usize = 0 };

pub fn find(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, name: []const u8) !Targets {
    const selected = (try children.child(a, tree, paragraph, xml.head_uri, name)) orelse return .{};
    const parent = tree.elements[selected].parent orelse return error.UnsupportedParagraphFormatBranch;
    if (parent == paragraph) {
        var cursor = tree.elements[paragraph].first_child;
        while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
            if (tree.elements[index].is(xml.paragraph_uri, "switch") and try containsField(tree, index, name, 0)) return error.UnsupportedParagraphFormatBranch;
        }
        return .{ .nodes = .{ selected, 0 }, .len = 1 };
    }
    if (!tree.elements[parent].is(xml.paragraph_uri, "default")) return error.UnsupportedParagraphFormatBranch;
    const wrapper = tree.elements[parent].parent orelse return error.UnsupportedParagraphFormatBranch;
    if (!tree.elements[wrapper].is(xml.paragraph_uri, "switch") or tree.elements[wrapper].parent != paragraph) return error.UnsupportedParagraphFormatBranch;
    var case: ?usize = null;
    var fallback: ?usize = null;
    var cursor = tree.elements[wrapper].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (element.is(xml.paragraph_uri, "case")) {
            if (case != null) return error.UnsupportedParagraphFormatBranch;
            var state: selection.State = .{};
            if (!try selection.chooseTree(a, tree, index, true, 4096, .{ .mode = .selected, .supported_namespaces = &.{unit_char_uri} }, &state)) return error.UnsupportedParagraphFormatBranch;
            case = index;
        } else if (element.is(xml.paragraph_uri, "default")) {
            if (fallback != null) return error.UnsupportedParagraphFormatBranch;
            fallback = index;
        } else return error.UnsupportedParagraphFormatBranch;
    }
    const modern = case orelse return error.UnsupportedParagraphFormatBranch;
    if (fallback != parent) return error.UnsupportedParagraphFormatBranch;
    const target = (try children.child(a, tree, modern, xml.head_uri, name)) orelse return error.UnsupportedParagraphFormatBranch;
    if (tree.elements[target].parent != modern) return error.UnsupportedParagraphFormatBranch;
    return .{ .nodes = .{ selected, target }, .len = 2 };
}

fn containsField(tree: *const Tree, parent: usize, name: []const u8, depth: usize) anyerror!bool {
    if (depth > 64) return error.LimitExceeded;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (element.is(xml.head_uri, name)) return true;
        if (element.is(xml.paragraph_uri, "switch") or element.is(xml.paragraph_uri, "case") or element.is(xml.paragraph_uri, "default")) {
            if (try containsField(tree, index, name, depth + 1)) return true;
        }
    }
    return false;
}
