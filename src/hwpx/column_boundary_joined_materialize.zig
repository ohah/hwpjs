//! Install source inventory once on an existing joined paragraph candidate.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;

pub fn install(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, limit: usize) !void {
    return installMode(a, tree, paragraph, limit, false, false);
}

pub fn installWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, limit: usize) !void {
    return installMode(a, tree, paragraph, limit, true, false);
}

pub fn installWithAnchors(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, limit: usize) !void {
    return installMode(a, tree, paragraph, limit, true, true);
}

fn installMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, limit: usize, allow_tabs: bool, anchors: bool) !void {
    const joined = paragraph.joined() orelse return error.MissingJoinedParagraph;
    if (anchors) {
        if (paragraph.generated_id != null) return error.UnsupportedColumnBoundaryEdit;
        try @import("column_boundary_joined_provenance.zig").validate(tree, &joined);
    }
    if (paragraph.protected_positions != null) {
        if (!anchors) return error.UnsupportedColumnBoundaryEdit;
        try @import("paragraph_joined_tab_group.zig").validateWithAnchors(a, tree, paragraph[0..1]);
    }
    if (paragraph.column_boundaries) |owned| {
        if (anchors) try @import("column_boundary_joined_partition.zig").validateWithAnchors(a, tree, &joined, owned) else if (allow_tabs) try @import("column_boundary_joined_partition.zig").validateWithTabs(a, tree, &joined, owned) else try @import("column_boundary_joined_partition.zig").validate(a, tree, &joined, owned);
        return;
    }
    const boundaries = if (anchors) try @import("column_boundary_joined_collect.zig").collectWithAnchors(a, tree, &joined, limit) else if (allow_tabs) try @import("column_boundary_joined_collect.zig").collectWithTabs(a, tree, &joined, limit) else try @import("column_boundary_joined_collect.zig").collect(a, tree, &joined, limit);
    errdefer a.free(boundaries);
    if (anchors) try @import("column_boundary_joined_partition.zig").validateWithAnchors(a, tree, &joined, boundaries) else if (allow_tabs) try @import("column_boundary_joined_partition.zig").validateWithTabs(a, tree, &joined, boundaries) else try @import("column_boundary_joined_partition.zig").validate(a, tree, &joined, boundaries);
    paragraph.column_boundaries = boundaries;
}
