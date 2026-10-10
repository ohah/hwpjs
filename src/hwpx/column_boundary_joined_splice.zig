//! Commit joined text and its editable column coordinates as one candidate.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;

pub fn splice(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceGroup(a, tree, @as(*[1]Paragraph, @ptrCast(paragraph)), 0, start, deleted, inserted, limit);
}

pub fn spliceGroup(a: std.mem.Allocator, tree: *const Tree, paragraphs: []Paragraph, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceMode(a, tree, paragraphs, index, start, deleted, inserted, limit, false, false);
}

pub fn spliceWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceMode(a, tree, @as(*[1]Paragraph, @ptrCast(paragraph)), 0, start, deleted, inserted, limit, true, false);
}

pub fn spliceGroupWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraphs: []Paragraph, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceMode(a, tree, paragraphs, index, start, deleted, inserted, limit, true, false);
}

pub fn spliceGroupWithAnchors(a: std.mem.Allocator, tree: *const Tree, paragraphs: []Paragraph, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceMode(a, tree, paragraphs, index, start, deleted, inserted, limit, true, true);
}

fn spliceMode(a: std.mem.Allocator, tree: *const Tree, paragraphs: []Paragraph, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize, allow_tabs: bool, anchors: bool) !bool {
    if (index >= paragraphs.len) return error.InvalidParagraphIndex;
    const paragraph = &paragraphs[index];
    const view = paragraph.joined() orelse return error.MissingJoinedParagraph;
    const owned = paragraph.column_boundaries orelse return error.MissingColumnBoundaries;
    if (anchors) {
        if (paragraph.character_styles != null) return error.UnsupportedColumnBoundaryEdit;
        try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, paragraphs);
    } else if (allow_tabs) {
        if (paragraph.character_styles != null) return error.UnsupportedColumnBoundaryEdit;
        if (paragraph.protected_positions != null) {
            try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, paragraphs);
        } else {
            if (paragraphs.len != 1) return error.UnsupportedColumnBoundaryEdit;
            try @import("column_boundary_joined_partition.zig").validateWithTabs(a, tree, &view, owned);
        }
    } else try @import("column_boundary_joined_group.zig").validate(a, tree, paragraphs);
    const positions = if (anchors) try @import("paragraph_joined_positions.zig").buildOwnedAnchors(a, tree, &view, paragraph.protected_positions orelse return error.MissingProtectedPositions) else if (allow_tabs and paragraph.protected_positions != null) try @import("paragraph_joined_positions.zig").buildOwnedTabs(a, tree, &view, paragraph.protected_positions.?) else if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &view) else try @import("paragraph_joined_positions.zig").build(a, tree, &view);
    defer a.free(positions);
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, start);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, end);
    const units = std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const inserted_units = std.math.cast(u32, try @import("text_site_edit.zig").utf16Length(inserted)) orelse return error.LimitExceeded;
    const boundaries = try @import("column_boundary_edit.zig").splice(a, owned, start, end, inserted_units, units, owned.len);
    defer a.free(boundaries);
    var draft = try paragraph.clone(a);
    defer draft.deinit(a);
    var joined = draft.joined().?;
    const changed = if (allow_tabs and draft.protected_positions != null) try @import("paragraph_protected_splice.zig").splice(a, tree, &draft, start, deleted, inserted, limit) else if (allow_tabs) try @import("paragraph_joined_splice.zig").spliceWithTabs(a, tree, &joined, start, deleted, inserted, limit) else try @import("paragraph_joined_splice.zig").splice(a, tree, &joined, start, deleted, inserted, limit);
    if (!changed) return false;
    if (!(allow_tabs and draft.protected_positions != null)) {
        draft.sites = joined.sites;
        draft.pieces = joined.pieces;
        draft.character_styles = joined.character_styles;
    }
    @memcpy(draft.column_boundaries.?, boundaries);
    const projected = try a.dupe(Paragraph, paragraphs);
    defer a.free(projected);
    projected[index] = draft;
    if (anchors) {
        try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, projected);
    } else if (allow_tabs) {
        if (draft.protected_positions != null) {
            try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, projected);
        } else {
            const current = draft.joined().?;
            try @import("column_boundary_joined_partition.zig").validateWithTabs(a, tree, &current, draft.column_boundaries.?);
        }
    } else try @import("column_boundary_joined_group.zig").validate(a, tree, projected);
    std.mem.swap(Paragraph, paragraph, &draft);
    return true;
}
