//! A source-only metadata text site does not require column topology rewriting.
pub fn eligible(section: *const @import("editor_session.zig").Section, paragraph: usize) !bool {
    if (section.structure_values != null) return false;
    if (section.sites.items.len != section.locations.len) return error.InvalidTextSites;
    var site_index: ?usize = null;
    for (section.locations, 0..) |location, index| {
        if (location.paragraph_ordinal != paragraph) continue;
        if (site_index != null) return false;
        site_index = index;
    }
    const site = section.sites.items[site_index orelse return false];
    if (!site.missing_text or site.anchor_boundary) return false;
    return @import("retained_run_metadata.zig").paragraphOnly(&section.tree, site.element_index);
}
