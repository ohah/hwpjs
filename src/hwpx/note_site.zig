const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");

/// Source-tree location of a note. All indices refer to the selected section;
/// byte_offset is in that section's original encoded XML bytes.
pub const Site = struct {
    control_element_index: ?usize = null,
    paragraph_element_index: ?usize = null,
    run_element_index: ?usize = null,
    text_element_index: ?usize = null,
    sub_list_element_index: ?usize = null,
    enclosing_note_element_index: ?usize = null,
    byte_offset: usize,
};

/// This is ancestry only: a ctrl wrapper or a nearby run is not a rendered
/// footnote marker, and no switch branch is selected here.
pub fn locate(tree: *const tree_mod.Tree, note_index: usize) !Site {
    if (note_index >= tree.elements.len) return error.InvalidNoteIndex;
    const note = tree.elements[note_index];
    if (!note.is(document_xml.paragraph_uri, "footNote") and !note.is(document_xml.paragraph_uri, "endNote")) return error.InvalidNoteIndex;
    var site: Site = .{ .byte_offset = note.start_tag.start };
    var cursor = note.parent;
    if (cursor) |parent_index| {
        if (parent_index >= tree.elements.len) return error.InvalidNoteParent;
        if (tree.elements[parent_index].is(document_xml.paragraph_uri, "ctrl")) site.control_element_index = parent_index;
    }
    var steps: usize = 0;
    while (cursor) |index| {
        if (index >= tree.elements.len or steps >= tree.elements.len) return error.InvalidNoteParent;
        steps += 1;
        const element = tree.elements[index];
        if (site.paragraph_element_index == null and element.is(document_xml.paragraph_uri, "p")) site.paragraph_element_index = index;
        if (site.run_element_index == null and element.is(document_xml.paragraph_uri, "run")) site.run_element_index = index;
        if (site.text_element_index == null and element.is(document_xml.paragraph_uri, "t")) site.text_element_index = index;
        if (site.sub_list_element_index == null and element.is(document_xml.paragraph_uri, "subList")) site.sub_list_element_index = index;
        if (site.enclosing_note_element_index == null and
            (element.is(document_xml.paragraph_uri, "footNote") or element.is(document_xml.paragraph_uri, "endNote"))) site.enclosing_note_element_index = index;
        cursor = element.parent;
    }
    return site;
}
