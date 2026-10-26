//! 현재 텍스트와 보호 개체 위치를 후보 문단에서 함께 검증합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const positions = @import("paragraph_protected_positions.zig");

pub fn splice(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *model.Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    if (paragraph.pieces != null and paragraph.character_styles != null) return error.UnsupportedAnchoredStructure;
    const segments = try positions.build(a, tree, paragraph);
    defer a.free(segments);
    var candidate = try paragraph.clone(a);
    defer candidate.deinit(a);
    const changed = if (candidate.character_styles != null)
        try @import("character_style_splice.zig").splicePositionsWithTree(a, tree, &candidate, segments, start, deleted, inserted, limit)
    else
        try @import("text_splice_transaction.zig").spliceProjected(a, &candidate.sites, segments, start, deleted, inserted, limit, null);
    if (!changed) return false;
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    const inserted_units = try @import("text_site_edit.zig").utf16Length(inserted);
    if (candidate.character_styles == null) try @import("title_mark_splice_current.zig").apply(a, &candidate, start, deleted, inserted_units);
    for (candidate.protected_positions.?) |*item| {
        if (item.unit >= end) item.unit = std.math.add(usize, item.unit - deleted, inserted_units) catch return error.LimitExceeded;
    }
    const validated = try positions.build(a, tree, &candidate);
    defer a.free(validated);
    std.mem.swap(model.Paragraph, paragraph, &candidate);
    return true;
}
