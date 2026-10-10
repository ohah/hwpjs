//! Source-owned note prefixes belong to the original, not generated continuations.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn currentOrdinal(tree: *const Tree, paragraphs: []const Paragraph, first: usize, template: usize, anchor: usize) !?usize {
    var found: ?usize = null;
    for (paragraphs, 0..) |paragraph, index| {
        if (paragraph.template_element != template or paragraph.generated_id != null or paragraph.source_ordinal == null or paragraph.pieces != null or paragraph.protected_positions != null) continue;
        var start: usize = std.math.maxInt(usize);
        for (paragraph.sites.items) |site| {
            if (!site.anchor_boundary) start = @min(start, site.start);
        }
        if (start == std.math.maxInt(usize) or !@import("retained_note_number.zig").supported(tree, anchor, template, start)) continue;
        if (found != null) return error.AmbiguousParagraphDisplayHost;
        found = std.math.add(usize, first, index) catch return error.LimitExceeded;
    }
    return found;
}
