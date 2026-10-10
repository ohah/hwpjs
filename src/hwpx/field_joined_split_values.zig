//! 여러 원본 필드 절단 초안에 문단 식별자와 원본 삭제 소유권을 부여합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *const model.Values, index: usize, start: u32, end: u32, id: u32, limit: usize) !model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (id == 0) return error.InvalidParagraphId;
    var ids: std.ArrayList(u32) = .empty;
    defer ids.deinit(a);
    for (current.paragraphs) |row| if (row.generated_id) |existing| try ids.append(a, existing);
    try ids.append(a, id);
    _ = try @import("paragraph_instance_ids.zig").next(a, trees, ids.items, std.math.maxInt(usize));
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const before = try @import("field_current_spans.zig").build(a, trees, section, current, &report, 200_000);
    defer a.free(before);
    var draft = try @import("field_joined_split_draft.zig").prepareValidated(a, trees, section, &current.paragraphs[index], start, end, limit);
    defer draft.deinit(a);
    const count = std.math.add(usize, current.paragraphs.len, 1) catch return error.LimitExceeded;
    if (count > limit / @sizeOf(model.Paragraph)) return error.LimitExceeded;
    const rows = try a.alloc(model.Paragraph, count);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*source, ordinal| {
        rows[initialized] = try source.clone(a);
        initialized += 1;
        if (ordinal != index) continue;
        try install(a, &rows[initialized - 1], &draft.text.left.sites, draft.left, draft.text.left.character_styles);
        rows[initialized] = try source.clone(a);
        initialized += 1;
        const right = &rows[initialized - 1];
        try install(a, right, &draft.text.right.sites, draft.right, draft.text.right.character_styles);
        right.source_ordinal = null;
        right.generated_id = id;
        for (right.pieces.?) |*piece| {
            piece.source_ordinal = null;
            piece.generated_id = id;
            piece.owns_source = false;
        }
    }
    const result: model.Values = .{ .paragraphs = rows };
    const after = try @import("field_current_spans.zig").build(a, trees, section, &result, &report, 200_000);
    defer a.free(after);
    _ = try result.byteSize(limit);
    return result;
}

fn install(a: std.mem.Allocator, row: *model.Paragraph, sites: *const @import("text_sites.zig").Sites, markers: []const @import("field_position.zig").Position, styles: ?[]const @import("character_style_paint.zig").Span) !void {
    const text = try sites.clone(a);
    row.sites.deinit(a);
    row.sites = text;
    const owned = try a.dupe(@import("field_position.zig").Position, markers);
    a.free(row.field_positions.?);
    row.field_positions = owned;
    const clipped = if (styles) |spans| try a.dupe(@import("character_style_paint.zig").Span, spans) else null;
    if (row.character_styles) |previous| a.free(previous);
    row.character_styles = clipped;
}
