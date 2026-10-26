//! Metadata-only field ownership must not rewrite untouched source paragraphs.
const std = @import("std");
pub fn unchanged(tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, original: *const @import("text_sites.zig").Sites) !bool {
    if (paragraph.pieces != null or paragraph.generated_id != null or paragraph.character_styles != null or paragraph.protected_positions != null or paragraph.column_boundaries != null or paragraph.page_area_positions != null) return false;
    var count: usize = 0;
    for (original.items) |site| {
        if (try @import("paragraph_site_owner.zig").ancestor(tree, site.element_index) != paragraph.template_element) continue;
        if (count >= paragraph.sites.items.len) return false;
        const current = paragraph.sites.items[count];
        if (site.element_index != current.element_index or site.start != current.start or site.end != current.end or site.empty_element != current.empty_element or site.missing_text != current.missing_text or site.anchor_boundary != current.anchor_boundary or !std.mem.eql(u8, site.text, current.text)) return false;
        count += 1;
    }
    return count == paragraph.sites.items.len;
}
