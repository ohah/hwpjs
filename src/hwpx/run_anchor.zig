//! Structural source anchors only. Does not validate/render object payloads.
const trees = @import("xml_part_tree.zig");
const std = @import("std");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Kind = enum { table, picture, equation, rectangle, line, container, footnote, endnote };

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
    if (element.is(uri, "container")) return .container;
    if (!element.is(uri, "ctrl")) return null;
    const child_index = element.first_child orelse return null;
    const child = tree.elements[child_index];
    if (child.next_sibling != null) return null;
    const inner_end = if (element.end_tag) |end| end.start else element.end;
    if (std.mem.trim(u8, tree.source[element.start_tag.end..child.start_tag.start], " \t\r\n").len != 0 or
        std.mem.trim(u8, tree.source[child.end..inner_end], " \t\r\n").len != 0) return null;
    if (child.is(uri, "footNote")) return .footnote;
    if (child.is(uri, "endNote")) return .endnote;
    return null;
}
