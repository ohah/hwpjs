//! Paragraph-local adapter, never a second document ordinal implementation.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const scanner = @import("section_text.zig");

pub fn build(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) ![]scanner.Location {
    if (paragraph.pieces != null) return error.UnsupportedJoinedParagraphLocations;
    const locations = try a.alloc(scanner.Location, paragraph.sites.items.len);
    errdefer a.free(locations);
    for (locations, 0..) |*location, index| location.* = .{ .section_ordinal = tree.section_ordinal orelse return error.InvalidPartOrdinal, .item_index = tree.item_index, .paragraph_ordinal = 1, .run_ordinal = index + 1, .text_ordinal = index + 1 };
    if (try @import("paragraph_site_owner.zig").resolve(tree, &paragraph.sites, locations, 1) != paragraph.template_element) return error.SourceBindingMismatch;
    return locations;
}
