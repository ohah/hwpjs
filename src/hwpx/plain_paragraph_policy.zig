//! Eligibility for the plain path, not a general paragraph/control parser.
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn validate(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) !void {
    if (locations.len != sites.items.len or paragraph == 0) return error.InvalidTextSites;
    var owner: ?usize = null;
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal != paragraph) continue;
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        var parent = tree.elements[site.element_index].parent;
        var found: ?usize = null;
        while (parent) |index| {
            if (tree.elements[index].is(uri, "p")) {
                found = index;
                break;
            }
            parent = tree.elements[index].parent;
        }
        const index = found orelse return error.SourceBindingMismatch;
        if (owner) |previous| {
            if (previous != index) return error.SourceBindingMismatch;
        } else owner = index;
    }
    const paragraph_index = owner orelse return error.MissingTextSite;
    var child = tree.elements[paragraph_index].first_child;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "run")) {
            var run_child = element.first_child;
            while (run_child) |run_index| {
                const content = tree.elements[run_index];
                // Section metadata has no text position; field/object/switch
                // semantics are not projected by this plain editing path.
                if (!content.is(uri, "t") and !content.is(uri, "secPr")) return error.UnsupportedParagraphControl;
                run_child = content.next_sibling;
            }
        } else if (!element.is(uri, "linesegarray")) return error.UnsupportedParagraphControl;
        child = element.next_sibling;
    }
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal == paragraph and tree.elements[site.element_index].first_child != null) return error.UnsupportedInlineControl;
    }
}
