//! Shared split/continuation metadata removal policy.
pub fn remove(element: @import("xml_part_tree.zig").Element, continuation: bool) bool {
    const uri = @import("document_xml.zig").paragraph_uri;
    return element.is(uri, "linesegarray") or (continuation and (element.is(uri, "secPr") or element.is(uri, "ctrl")));
}
