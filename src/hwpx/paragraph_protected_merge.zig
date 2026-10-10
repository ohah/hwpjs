//! 같은 원본에서 분할된 인접 문단의 텍스트와 개체 소유권을 합칩니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const positions = @import("paragraph_protected_positions.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, left: *const model.Paragraph, right: *const model.Paragraph, limit: usize) !model.Paragraph {
    if (left.template_element != right.template_element or left.protected_positions == null or right.protected_positions == null or left.paragraph_shape_id != right.paragraph_shape_id) return error.UnsupportedAnchoredStructure;
    if (left.pieces != null or right.pieces != null) {
        const left_pieces = left.pieces orelse return error.UnsupportedAnchoredStructure;
        const right_pieces = right.pieces orelse return error.UnsupportedAnchoredStructure;
        if (left.character_styles != null or right.character_styles != null) return error.UnsupportedAnchoredStructure;
        if (left_pieces.len != right_pieces.len or right.generated_id == null or right.source_ordinal != null) return error.SourceBindingMismatch;
        for (left_pieces, right_pieces) |first, second| {
            if (first.template_element != second.template_element or first.first_site != second.first_site or first.site_count != second.site_count or second.owns_source) return error.SourceBindingMismatch;
        }
    }
    if (left.sites.items.len != right.sites.items.len) return error.SourceBindingMismatch;
    const left_segments = try positions.build(a, tree, left);
    defer a.free(left_segments);
    const right_segments = try positions.build(a, tree, right);
    defer a.free(right_segments);
    const offset = if (left_segments.len == 0) 0 else left_segments[left_segments.len - 1].end_unit;
    const right_units = if (right_segments.len == 0) 0 else right_segments[right_segments.len - 1].end_unit;
    const left_titles = try @import("title_mark_current.zig").read(a, tree, left);
    defer a.free(left_titles);
    const right_titles = try @import("title_mark_current.zig").read(a, tree, right);
    defer a.free(right_titles);
    var candidate = try left.clone(a);
    errdefer candidate.deinit(a);
    const titles = try @import("title_mark_position.zig").merge(a, left_titles, right_titles, offset, right_units);
    if (candidate.title_positions) |items| a.free(items);
    candidate.title_positions = titles;
    for (candidate.sites.items, right.sites.items) |site, other| _ = try @import("text_sites_save.zig").siteChange(tree, site, other);
    const moves = try @import("paragraph_protected_merge_text.zig").fillMapped(a, tree, &candidate, left, right, left_segments, right_segments, limit);
    defer a.free(moves);
    const count = std.math.add(usize, left.protected_positions.?.len, right.protected_positions.?.len) catch return error.LimitExceeded;
    const owned = try a.alloc(model.ProtectedPosition, count);
    var installed = false;
    errdefer if (!installed) a.free(owned);
    @memcpy(owned[0..left.protected_positions.?.len], left.protected_positions.?);
    for (right.protected_positions.?, owned[left.protected_positions.?.len..]) |item, *target| {
        target.* = item;
        target.unit = std.math.add(usize, item.unit, offset) catch return error.LimitExceeded;
    }
    a.free(candidate.protected_positions.?);
    candidate.protected_positions = owned;
    installed = true;
    if (left.character_styles != null or right.character_styles != null) {
        if (candidate.character_styles) |styles| a.free(styles);
        candidate.character_styles = null;
        candidate.character_styles = try @import("character_style_protected_merge.zig").prepare(a, tree, &candidate, left, right, left_segments, right_segments, moves, limit);
    }
    const validated = try positions.build(a, tree, &candidate);
    a.free(validated);
    return candidate;
}
