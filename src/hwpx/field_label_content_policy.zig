//! Shared original field-content inspection only. No ownership or permission.
//! Keep whitelist order and descendant-marker errors identical for all callers.
const Tree = @import("xml_part_tree.zig").Tree;
const Range = @import("field_text_ranges.zig").Range;
const Report = @import("field_markers.zig").Report;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn firstUnsupportedNode(tree: *const Tree, selected: Range, ranges: []const Range, report: *const Report, allow_nested: bool) !?usize {
    for (tree.elements, 0..) |element, index| {
        if (element.start_tag.start < selected.content_start or element.start_tag.start >= selected.content_end) continue;
        if (element.is(uri, "p") or element.is(uri, "run") or element.is(uri, "t") or element.is(uri, "ctrl") or element.is(uri, "linesegarray") or element.is(uri, "lineseg")) continue;
        if (@import("retained_inline_unit.zig").supported(tree, index)) continue;
        if (allow_nested and try @import("field_nested_ownership.zig").retainedDescendantMarker(tree, index, selected, ranges, report)) continue;
        return index;
    }
    return null;
}
