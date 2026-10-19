//! Rejoin column continuations while preserving text order and source ownership.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, limit: usize) !model.Values {
    const group = try @import("column_boundary_group.zig").locate(current, index);
    if (index + 1 >= group.end) return error.UnsupportedColumnBoundaryEdit;
    try @import("column_boundary_joined_group.zig").validate(a, tree, current.paragraphs[group.start..group.end]);
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[index + 1];
    if (left.protected_positions != null or right.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    const lv = left.joined() orelse return error.MissingJoinedParagraph;
    const rv = right.joined() orelse return error.MissingJoinedParagraph;
    const lp = try @import("paragraph_joined_positions.zig").build(a, tree, &lv);
    defer a.free(lp);
    const rp = try @import("paragraph_joined_positions.zig").build(a, tree, &rv);
    defer a.free(rp);
    const lu = std.math.cast(u32, if (lp.len == 0) 0 else lp[lp.len - 1].end_unit) orelse return error.LimitExceeded;
    const ru = std.math.cast(u32, if (rp.len == 0) 0 else rp[rp.len - 1].end_unit) orelse return error.LimitExceeded;
    const pieces = try a.alloc(@import("paragraph_joined_values.zig").Piece, std.math.add(usize, lv.pieces.len, rv.pieces.len) catch return error.LimitExceeded);
    defer a.free(pieces);
    @memcpy(pieces[0..lv.pieces.len], lv.pieces);
    for (rv.pieces, pieces[lv.pieces.len..]) |piece, *target| {
        target.* = piece;
        target.first_site = std.math.add(usize, piece.first_site, lv.sites.items.len) catch return error.LimitExceeded;
    }
    const rows = try a.alloc(@import("text_sites.zig").Site, std.math.add(usize, lv.sites.items.len, rv.sites.items.len) catch return error.LimitExceeded);
    defer a.free(rows);
    @memcpy(rows[0..lv.sites.items.len], lv.sites.items);
    @memcpy(rows[lv.sites.items.len..], rv.sites.items);
    const styles = try @import("character_style_join.zig").prepare(a, tree, &lv, &rv);
    defer if (styles) |items| a.free(items);
    const borrowed: @import("paragraph_joined_values.zig").Joined = .{ .pieces = pieces, .sites = .{ .items = rows }, .character_styles = styles };
    const folded = try @import("paragraph_joined_fold.zig").prepare(a, &borrowed, lv.pieces.len, limit) orelse try borrowed.clone(a);
    var merged: model.Paragraph = .{ .template_element = left.template_element, .source_ordinal = left.source_ordinal, .generated_id = left.generated_id, .break_before = left.break_before, .paragraph_shape_id = left.paragraph_shape_id, .sites = folded.sites, .pieces = folded.pieces, .character_styles = folded.character_styles, .column_structure_changed = true };
    if (merged.generated_id) |id| for (merged.pieces.?) |*piece| {
        piece.generated_id = id;
    };
    var transferred = false;
    defer if (!transferred) merged.deinit(a);
    merged.column_boundaries = try @import("column_boundary_edit.zig").merge(a, left.column_boundaries.?, right.column_boundaries.?, lu, ru, tree.elements.len);
    const paragraphs = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (paragraphs[0..initialized]) |*part| part.deinit(a);
        a.free(paragraphs);
    }
    for (current.paragraphs, 0..) |*part, ordinal| {
        if (ordinal == index + 1) continue;
        if (ordinal == index) {
            paragraphs[initialized] = merged;
            transferred = true;
        } else paragraphs[initialized] = try part.clone(a);
        initialized += 1;
    }
    const result: model.Values = .{ .paragraphs = paragraphs };
    try @import("column_boundary_joined_group.zig").validate(a, tree, result.paragraphs[group.start .. group.end - 1]);
    _ = try result.byteSize(limit);
    return result;
}
