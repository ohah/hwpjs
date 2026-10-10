//! 숨긴 빈 조각의 서식을 유지하면서 입력용 서식 투영을 연결합니다.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;
const Span = @import("character_style_paint.zig").Span;

pub fn complete(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined) ![]Span {
    try current.validate();
    const styles = current.character_styles orelse return error.InvalidTextSites;
    var output: std.ArrayList(Span) = .empty;
    defer output.deinit(a);
    var cursor: usize = 0;
    for (current.sites.items, 0..) |site, index| {
        if (cursor < styles.len and styles[cursor].site_index < index) return error.InvalidTextSites;
        if (cursor < styles.len and styles[cursor].site_index == index) {
            while (cursor < styles.len and styles[cursor].site_index == index) : (cursor += 1) {
                _ = try hidden(current, styles[cursor]);
                try output.append(a, styles[cursor]);
            }
            continue;
        }
        const base = if (cursor < styles.len) styles[cursor].site_start_unit else if (output.items.len != 0) output.items[output.items.len - 1].end_unit else 0;
        var span: Span = .{ .start_unit = base, .end_unit = base, .site_start_unit = base, .site_index = index, .run_element = 0, .char_shape_id = null };
        if (!try hidden(current, span)) return error.InvalidTextSites;
        if (site.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        span.run_element = if (site.missing_text) site.element_index else tree.elements[site.element_index].parent orelse return error.SourceBindingMismatch;
        span.char_shape_id = try @import("character_style_projection.zig").runId(a, tree, span.run_element);
        try output.append(a, span);
    }
    if (cursor != styles.len) return error.InvalidTextSites;
    return output.toOwnedSlice(a);
}

pub fn visible(a: std.mem.Allocator, current: *const Joined) ![]Span {
    var output: std.ArrayList(Span) = .empty;
    defer output.deinit(a);
    for (current.character_styles orelse return error.InvalidTextSites) |span| {
        if (!try hidden(current, span)) try output.append(a, span);
    }
    return output.toOwnedSlice(a);
}

pub fn restore(a: std.mem.Allocator, original: *const Joined, edited: *const Joined) ![]Span {
    const current = edited.character_styles orelse return error.InvalidTextSites;
    var output: std.ArrayList(Span) = .empty;
    defer output.deinit(a);
    var cursor: usize = 0;
    for (original.character_styles orelse return error.InvalidTextSites) |span| {
        if (!try hidden(original, span)) continue;
        while (cursor < current.len and current[cursor].site_index < span.site_index) : (cursor += 1) try output.append(a, current[cursor]);
        var retained = span;
        const base = if (cursor < current.len) current[cursor].site_start_unit else if (current.len != 0) current[current.len - 1].end_unit else 0;
        retained.start_unit = base;
        retained.end_unit = base;
        retained.site_start_unit = base;
        try output.append(a, retained);
    }
    try output.appendSlice(a, current[cursor..]);
    return output.toOwnedSlice(a);
}

fn hidden(current: *const Joined, span: Span) !bool {
    if (span.site_index >= current.sites.items.len) return error.InvalidTextSites;
    for (current.pieces) |piece| {
        if (span.site_index < piece.first_site or span.site_index - piece.first_site >= piece.site_count) continue;
        if (piece.output != .inventory_only and !piece.template_only) return false;
        if (span.anchor_element != null or span.tab_element != null or span.start_unit != span.end_unit or current.sites.items[span.site_index].text.len != 0) return error.InvalidTextSites;
        return true;
    }
    return error.SourceBindingMismatch;
}
