//! Transaction boundary for plain current text and owned zero-width titles.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
pub fn splice(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) !bool {
    if (paragraph.title_positions == null or paragraph.protected_positions != null or paragraph.character_styles != null or paragraph.pieces != null) return error.SourceBindingMismatch;
    var candidate = try paragraph.clone(a);
    defer candidate.deinit(a);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, &candidate);
    defer a.free(locations);
    const changed = if (anchored)
        try @import("anchor_paragraph_edit.zig").splice(a, tree, &candidate.sites, locations, 1, start, deleted, inserted, limit)
    else
        try @import("plain_paragraph_edit.zig").spliceWithTabs(a, tree, &candidate.sites, locations, 1, start, deleted, inserted, limit, true);
    if (!changed) return false;
    try @import("title_mark_splice_current.zig").apply(a, &candidate, start, deleted, try @import("text_site_edit.zig").utf16Length(inserted));
    std.mem.swap(Paragraph, paragraph, &candidate);
    return true;
}
