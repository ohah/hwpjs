//! Structural source anchors only. Does not validate/render object payloads.
const trees = @import("xml_part_tree.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Kind = enum { table, picture, equation, rectangle, line, container, footnote, endnote, automatic_number };

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
    if (!gaps.empty(tree, index)) return null;
    if (child.is(uri, "footNote")) return .footnote;
    if (child.is(uri, "endNote")) return .endnote;
    if (@import("retained_auto_number.zig").supported(tree, child_index)) return .automatic_number;
    return null;
}
