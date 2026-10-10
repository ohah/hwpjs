//! Commit text and column coordinates together; immutable XML is provenance only.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn splice(a: std.mem.Allocator, tree: *const Tree, paragraph: *model.Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) anyerror!bool {
    if (paragraph.generated_id != null or paragraph.source_ordinal == null or paragraph.pieces != null or paragraph.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    return spliceGroup(a, tree, @as(*[1]model.Paragraph, @ptrCast(paragraph)), 0, start, deleted, inserted, limit, anchored);
}

pub fn spliceGroup(a: std.mem.Allocator, tree: *const Tree, paragraphs: []model.Paragraph, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) anyerror!bool {
    if (index >= paragraphs.len) return error.InvalidParagraphIndex;
    const paragraph = &paragraphs[index];
    for (paragraphs) |part| if (part.pieces != null or part.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    try @import("column_boundary_partition.zig").validate(a, tree, paragraphs);
    const positions = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(positions);
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, start);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, end);
    const length = if (positions.len == 0) 0 else positions[positions.len - 1].end_unit;
    const units = std.math.cast(u32, length) orelse return error.LimitExceeded;
    const inserted_units = std.math.cast(u32, try @import("text_site_edit.zig").utf16Length(inserted)) orelse return error.LimitExceeded;
    var draft = try paragraph.clone(a);
    defer draft.deinit(a);
    // The existing text editor operates on a detached candidate, never the original.
    const previous = draft.column_boundaries.?;
    draft.column_boundaries = null;
    defer a.free(previous);
    var values: model.Values = .{ .paragraphs = @as(*[1]model.Paragraph, @ptrCast(&draft)) };
    if (!try @import("paragraph_structure_splice.zig").spliceMode(a, tree, &values, 0, start, deleted, inserted, limit, anchored)) return false;
    draft.column_boundaries = try @import("column_boundary_edit.zig").splice(a, previous, start, end, inserted_units, units, previous.len);
    const validation = try a.dupe(model.Paragraph, paragraphs);
    defer a.free(validation);
    validation[index] = draft;
    try @import("column_boundary_partition.zig").validate(a, tree, validation);
    std.mem.swap(model.Paragraph, paragraph, &draft);
    return true;
}
