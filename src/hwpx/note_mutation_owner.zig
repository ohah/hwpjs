//! Structural source ownership for a future note mutation. This is not an edit
//! capability: session/history/field/numbering admission remains with the caller.
//! No NoteType attributes are inferred or emitted from implementation models.
const trees = @import("xml_part_tree.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Kind = @import("note_bodies.zig").Kind;
pub const Owner = struct {
    section: usize,
    kind: Kind,
    note_node: usize,
    control_node: usize,
    run_node: usize,
    paragraph_node: usize,
    list_node: usize,
    direct_paragraphs: usize,
};

/// Uses existing note ancestry, direct run-anchor ownership, and note paragraph
/// context. No visible paragraph ordinal or client-provided label is authority.
pub fn read(tree: *const trees.Tree, note_node: usize) !Owner {
    if (tree.part_kind != .section or tree.section_ordinal == null or tree.elements.len == 0)
        return error.InvalidSectionIndex;
    if (tree.elements[0].name.local.encoding != .utf8)
        return error.UnsupportedNoteMutationEncoding;
    const site = try @import("note_site.zig").locate(tree, note_node);
    if (site.text_element_index != null or site.enclosing_note_element_index != null)
        return error.UnsupportedNoteMutationOwner;
    const control_node = site.control_element_index orelse return error.UnsupportedNoteMutationOwner;
    const run_node = site.run_element_index orelse return error.UnsupportedNoteMutationOwner;
    const paragraph_node = site.paragraph_element_index orelse return error.UnsupportedNoteMutationOwner;
    const note = tree.elements[note_node];
    const control = tree.elements[control_node];
    if (control.parent != run_node or tree.elements[run_node].parent != paragraph_node or
        control.first_child != note_node or note.next_sibling != null)
        return error.UnsupportedNoteMutationOwner;
    const anchor_kind = @import("run_anchor.zig").kind(tree, control_node) orelse return error.UnsupportedNoteMutationOwner;
    const kind: Kind = if (note.is(uri, "footNote")) .foot else .end;
    if (anchor_kind != @as(@TypeOf(anchor_kind), if (kind == .foot) .footnote else .endnote))
        return error.SourceBindingMismatch;
    const list_node = note.first_child orelse return error.UnsupportedNoteMutationBody;
    if (list_node >= tree.elements.len or !tree.elements[list_node].is(uri, "subList") or
        tree.elements[list_node].parent != note_node or tree.elements[list_node].next_sibling != null or
        !@import("element_whitespace_gaps.zig").empty(tree, note_node))
        return error.UnsupportedNoteMutationBody;
    var count: usize = 0;
    var child = tree.elements[list_node].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (node >= tree.elements.len or count >= tree.elements.len)
            return error.InvalidPartTree;
        if (!tree.elements[node].is(uri, "p") or tree.elements[node].parent != list_node)
            return error.UnsupportedNoteMutationBody;
        const context = (try @import("note_paragraph_context.zig").read(tree, node)) orelse return error.SourceBindingMismatch;
        if (context.note_node != note_node or context.list_node != list_node or
            context.kind != @as(@TypeOf(context.kind), if (kind == .foot) .footnote else .endnote))
            return error.SourceBindingMismatch;
        count += 1;
    }
    if (count == 0) return error.UnsupportedNoteMutationBody;
    return .{
        .section = tree.section_ordinal.?,
        .kind = kind,
        .note_node = note_node,
        .control_node = control_node,
        .run_node = run_node,
        .paragraph_node = paragraph_node,
        .list_node = list_node,
        .direct_paragraphs = count,
    };
}
