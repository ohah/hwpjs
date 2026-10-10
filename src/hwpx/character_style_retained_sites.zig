//! Transient source-order inventory; current text/styles remain Paragraph-owned.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Site = struct { element: usize, source_start: usize, text_element: ?usize };
pub fn collectOwned(a: std.mem.Allocator, tree: *const Tree, run: usize, titles: ?[]const @import("title_mark_position.zig").Position) ![]Site {
    const source = try collect(a, tree, run);
    errdefer a.free(source);
    const owned = titles orelse return source;
    var result: std.ArrayList(Site) = .empty;
    defer result.deinit(a);
    for (source) |site| {
        if (site.text_element != null) {
            var found = false;
            for (owned) |position| if (position.element_index == site.element) {
                found = true;
                break;
            };
            if (!found) continue;
        }
        try result.append(a, site);
    }
    const output = try result.toOwnedSlice(a);
    a.free(source);
    return output;
}
pub fn collect(a: std.mem.Allocator, tree: *const Tree, run: usize) ![]Site {
    if (run >= tree.elements.len or !tree.elements[run].is(uri, "run")) return error.SourceBindingMismatch;
    var sites: std.ArrayList(Site) = .empty;
    defer sites.deinit(a);
    var child = tree.elements[run].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const node = tree.elements[index];
        if (@import("retained_run_metadata.zig").supported(tree, index) or @import("retained_bookmark.zig").directSupported(tree, index)) {
            try sites.append(a, .{ .element = index, .source_start = node.start_tag.start, .text_element = null });
        } else if (node.is(uri, "t")) {
            var nested = node.first_child;
            while (nested) |marker| : (nested = tree.elements[marker].next_sibling) {
                if (@import("title_mark_axis.zig").retained(tree, marker)) {
                    try sites.append(a, .{ .element = marker, .source_start = tree.elements[marker].start_tag.start, .text_element = index });
                } else if (!@import("retained_inline_unit.zig").supported(tree, marker)) return error.UnsupportedInlineControl;
            }
        } else if (@import("run_anchor.zig").kind(tree, index) == null) return error.UnsupportedParagraphControl;
    }
    return sites.toOwnedSlice(a);
}
