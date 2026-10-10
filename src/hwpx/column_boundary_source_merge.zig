//! Merge adjacent source owners while retaining current text and column controls.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, limit: usize) !model.Values {
    return prepareMode(a, tree, current, index, limit, false);
}

pub fn prepareWithTabs(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, limit: usize) !model.Values {
    return prepareMode(a, tree, current, index, limit, true);
}

/// 최초 병합 후보에 현재 탭 소유권을 설치해 공통 명령/저장 경로에 연결합니다.
pub fn prepareOwnedTabs(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, limit: usize) !model.Values {
    var result = try prepareWithTabs(a, tree, current, index, limit);
    errdefer result.deinit(a);
    const paragraph = &result.paragraphs[index];
    const joined = paragraph.joined().?;
    const segments = try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &joined);
    defer a.free(segments);
    paragraph.protected_positions = try @import("paragraph_protected_positions.zig").side(a, segments, 0, 0, true);
    try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, result.paragraphs[index .. index + 1]);
    _ = try result.byteSize(limit);
    return result;
}

fn prepareMode(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, limit: usize, allow_tabs: bool) !model.Values {
    if (index >= current.paragraphs.len or current.paragraphs.len - index < 2) return error.InvalidParagraphIndex;
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[index + 1];
    if (allow_tabs and (left.character_styles != null or right.character_styles != null)) return error.UnsupportedAnchoredStructure;
    if (left.template_element >= tree.elements.len or right.template_element >= tree.elements.len) return error.SourceBindingMismatch;
    for ([_]*const model.Paragraph{ left, right }, 0..) |part, offset| {
        if (part.generated_id != null or part.source_ordinal == null or part.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
        const group = try @import("column_boundary_group.zig").locate(current, index + offset);
        if (group.start != index + offset or group.end != group.start + 1) return error.UnsupportedColumnBoundaryEdit;
    }
    // The text adapter borrows provenance only; column ownership stays in the
    // separately validated paragraph clones and is merged below.
    var left_text = left.*;
    left_text.column_boundaries = null;
    var right_text = right.*;
    right_text.column_boundaries = null;
    var left_joined = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &left_text);
    defer left_joined.deinit(a);
    var right_joined = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &right_text);
    defer right_joined.deinit(a);
    try @import("column_boundary_joined_provenance.zig").validate(tree, &left_joined);
    try @import("column_boundary_joined_provenance.zig").validate(tree, &right_joined);
    var last_owner = left.template_element;
    for (left_joined.pieces) |piece| if (piece.owns_source) {
        last_owner = piece.template_element;
    };
    if (tree.elements[last_owner].parent != tree.elements[right.template_element].parent) return error.CrossParagraphOwner;
    if (tree.elements[last_owner].next_sibling != right.template_element) return error.InvalidParagraphAdjacency;
    for (right_joined.pieces) |piece| if (piece.owns_source) try @import("column_boundary_joined_metadata.zig").validateRight(tree, piece.template_element);
    var left_owned = try left.clone(a);
    defer left_owned.deinit(a);
    var right_owned = try right.clone(a);
    defer right_owned.deinit(a);
    for ([_]*model.Paragraph{ &left_owned, &right_owned }) |part| {
        if (part.pieces != null) {
            if (allow_tabs) try @import("column_boundary_joined_materialize.zig").installWithTabs(a, tree, part, tree.elements.len) else try @import("column_boundary_joined_materialize.zig").install(a, tree, part, tree.elements.len);
        } else {
            try @import("column_boundary_materialize.zig").install(a, tree, part, tree.elements.len);
            try @import("column_boundary_partition.zig").validate(a, tree, part[0..1]);
        }
    }
    const left_positions = if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &left_joined) else try @import("paragraph_joined_positions.zig").build(a, tree, &left_joined);
    defer a.free(left_positions);
    const right_positions = if (allow_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &right_joined) else try @import("paragraph_joined_positions.zig").build(a, tree, &right_joined);
    defer a.free(right_positions);
    const left_units = std.math.cast(u32, if (left_positions.len == 0) 0 else left_positions[left_positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const right_units = std.math.cast(u32, if (right_positions.len == 0) 0 else right_positions[right_positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const boundaries = try @import("column_boundary_edit.zig").merge(a, left_owned.column_boundaries.?, right_owned.column_boundaries.?, left_units, right_units, tree.elements.len);
    errdefer a.free(boundaries);
    const site_count = std.math.add(usize, left.sites.items.len, right.sites.items.len) catch return error.LimitExceeded;
    const rows = try a.alloc(@import("text_sites.zig").Site, site_count);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |site| a.free(site.text);
        a.free(rows);
    }
    for ([_]*const model.Paragraph{ left, right }) |part| for (part.sites.items) |site| {
        rows[initialized] = site;
        rows[initialized].text = try a.dupe(u8, site.text);
        initialized += 1;
    };
    const pieces = try a.alloc(@import("paragraph_joined_values.zig").Piece, std.math.add(usize, left_joined.pieces.len, right_joined.pieces.len) catch return error.LimitExceeded);
    errdefer a.free(pieces);
    @memcpy(pieces[0..left_joined.pieces.len], left_joined.pieces);
    for (right_joined.pieces, pieces[left_joined.pieces.len..]) |piece, *target| {
        target.* = piece;
        target.first_site = std.math.add(usize, piece.first_site, left.sites.items.len) catch return error.LimitExceeded;
    }
    const styles = try @import("character_style_join.zig").prepare(a, tree, &left_joined, &right_joined);
    errdefer if (styles) |items| a.free(items);
    var merged: model.Paragraph = .{ .template_element = left.template_element, .source_ordinal = left.source_ordinal, .paragraph_shape_id = left.paragraph_shape_id, .sites = .{ .items = rows }, .pieces = pieces, .character_styles = styles, .column_structure_changed = true };
    merged.column_boundaries = boundaries;
    const joined_view = merged.joined().?;
    try @import("column_boundary_joined_provenance.zig").validate(tree, &joined_view);
    if (allow_tabs) try @import("column_boundary_joined_materialize.zig").installWithTabs(a, tree, &merged, tree.elements.len) else try @import("column_boundary_joined_materialize.zig").install(a, tree, &merged, tree.elements.len);
    const paragraphs = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var copied: usize = 0;
    errdefer {
        for (paragraphs[0..copied], 0..) |*part, ordinal| if (ordinal != index) part.deinit(a);
        a.free(paragraphs);
    }
    for (current.paragraphs, 0..) |part, ordinal| {
        if (ordinal == index + 1) continue;
        paragraphs[copied] = if (ordinal == index) merged else try part.clone(a);
        copied += 1;
    }
    const result: model.Values = .{ .paragraphs = paragraphs };
    _ = try result.byteSize(limit);
    return result;
}
