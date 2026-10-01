//! Prefix note numbering is retained source, not editable text or a generated number.
const emptyGaps = @import("element_whitespace_gaps.zig").empty;
const trees = @import("xml_part_tree.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn supported(tree: *const trees.Tree, control_index: usize, paragraph_index: usize, first_text_start: usize) bool {
    if (control_index >= tree.elements.len or paragraph_index >= tree.elements.len) return false;
    const paragraph = tree.elements[paragraph_index];
    const list_index = paragraph.parent orelse return false;
    const list = tree.elements[list_index];
    if (!list.is(uri, "subList")) return false;
    const note_index = list.parent orelse return false;
    const note = tree.elements[note_index];
    if (!note.is(uri, "footNote") and !note.is(uri, "endNote")) return false;
    const control = tree.elements[control_index];
    if (!control.is(uri, "ctrl") or control.end > first_text_start) return false;
    const run_index = control.parent orelse return false;
    if (!tree.elements[run_index].is(uri, "run") or tree.elements[run_index].parent != paragraph_index) return false;
    const number_index = control.first_child orelse return false;
    const number = tree.elements[number_index];
    if (!number.is(uri, "autoNum") or number.next_sibling != null or !emptyGaps(tree, control_index)) return false;
    const format_index = number.first_child orelse return false;
    const format = tree.elements[format_index];
    return format.is(uri, "autoNumFormat") and @import("retained_auto_number.zig").supported(tree, number_index);
}
