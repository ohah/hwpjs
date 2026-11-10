//! Admission of live generated BODY owners only. Current text remains in Sites;
//! immutable XML proves provenance, never current ordinals or current text length.
const editor = @import("editor_session.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");

pub fn validate(section: *const editor.Section, paragraph: *const Paragraph) !void {
    if (section.structure_values == null or section.sites.items.len != 0 or
        paragraph.source_ordinal != null or (paragraph.generated_id orelse 0) == 0)
        return error.UnsupportedFormattingOwner;
    try bodyTemplate(&section.tree, paragraph.template_element);
    if (paragraph.joined()) |joined| {
        try joined.validate();
        if (joined.pieces[0].template_element != paragraph.template_element) return error.SourceBindingMismatch;
        for (joined.pieces, 0..) |_, index| {
            const part = try joined.paragraph(index);
            try bodyTemplate(&section.tree, part.template_element);
            try siteOwners(&section.tree, &part);
        }
    } else try siteOwners(&section.tree, paragraph);
    // Scalar/control/field boundaries and actual writability are still checked
    // by the existing current-text projections and field-specific writers.
}
fn bodyTemplate(tree: *const Tree, node: usize) !void {
    if (node >= tree.elements.len) return error.SourceBindingMismatch;
    if (!tree.elements[node].is(xml.paragraph_uri, "p")) return error.SourceBindingMismatch;
    const parent = tree.elements[node].parent orelse return error.UnsupportedFormattingOwner;
    if (parent >= tree.elements.len) return error.SourceBindingMismatch;
    if (tree.part_kind != .section or !tree.elements[parent].is(xml.section_uri, "sec") or tree.elements[parent].parent != null)
        return error.UnsupportedFormattingOwner;
}
fn siteOwners(tree: *const Tree, paragraph: *const Paragraph) !void {
    for (paragraph.sites.items) |site| {
        if (try @import("paragraph_site_owner.zig").ancestor(tree, site.element_index) != paragraph.template_element)
            return error.SourceBindingMismatch;
    }
}
