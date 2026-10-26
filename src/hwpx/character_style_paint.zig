//! Owned candidate only: no text copies, source mutation or session commit.
const std = @import("std");
const Sites = @import("text_sites.zig").Sites;
pub const Span = struct {
    start_unit: usize,
    end_unit: usize,
    site_start_unit: usize,
    site_index: usize,
    run_element: usize,
    char_shape_id: ?u32,
    /// Protected XML tab provenance, never an editable Sites index.
    tab_element: ?usize = null,
    /// Protected direct run object, never a text site or tab.
    anchor_element: ?usize = null,
    /// Identity of a canonical emitted title fragment; not a text owner.
    canonical_fragment: ?usize = null,
};

pub fn fromProjection(a: std.mem.Allocator, input: []const @import("character_style_projection.zig").Span, limit: usize) ![]Span {
    if (input.len > limit) return error.LimitExceeded;
    const output = try a.alloc(Span, input.len);
    for (input, output) |source, *span| span.* = .{ .start_unit = source.start_unit, .end_unit = source.end_unit, .site_start_unit = source.start_unit, .site_index = source.site_index, .run_element = source.run_element, .char_shape_id = source.source_char_shape_id };
    return output;
}

pub fn prepare(a: std.mem.Allocator, sites: *const Sites, current: []const Span, start: u32, end: u32, id: u32, resource_ids: []const u32, limit: usize) ![]Span {
    if (std.mem.indexOfScalar(u32, resource_ids, id) == null) return error.InvalidResourceReference;
    if (current.len == 0 or start > end or end > current[current.len - 1].end_unit) return error.InvalidTextPosition;
    var output: std.ArrayList(Span) = .empty;
    defer output.deinit(a);
    var cursor: usize = 0;
    for (current, 0..) |span, index| {
        if (span.anchor_element != null or span.tab_element != null) {
            if (span.anchor_element != null and span.tab_element != null) return error.InvalidTextSites;
            if (span.start_unit != cursor or span.end_unit < cursor or span.end_unit - cursor != 1) return error.InvalidTextSites;
            const pieces = @import("character_style_selection.zig").split(Span, span, start, end, id);
            for (pieces.items[0..pieces.len]) |piece| try append(a, &output, piece, limit);
            cursor = span.end_unit;
            continue;
        }
        if (span.site_index >= sites.items.len or span.start_unit != cursor or span.end_unit < cursor or span.site_start_unit > span.start_unit) return error.InvalidTextSites;
        const text = sites.items[span.site_index].text;
        if (index == 0 or current[index - 1].site_index != span.site_index) {
            if (span.start_unit != span.site_start_unit) return error.InvalidTextSites;
        } else if (current[index - 1].site_start_unit != span.site_start_unit or current[index - 1].run_element != span.run_element) return error.SourceBindingMismatch;
        const byte_end = try @import("text_site_edit.zig").bytePosition(text, std.math.cast(u32, span.end_unit - span.site_start_unit) orelse return error.LimitExceeded);
        if ((index + 1 == current.len or current[index + 1].site_index != span.site_index) and byte_end != text.len) return error.InvalidTextSites;
        for ([_]u32{ start, end }) |boundary| {
            if (boundary >= span.start_unit and boundary <= span.end_unit)
                _ = try @import("text_site_edit.zig").bytePosition(text, std.math.cast(u32, boundary - span.site_start_unit) orelse return error.LimitExceeded);
        }
        const low = @max(span.start_unit, start);
        const high = @min(span.end_unit, end);
        if (low < high) {
            _ = try @import("text_site_edit.zig").bytePosition(text, std.math.cast(u32, low - span.site_start_unit) orelse return error.LimitExceeded);
            _ = try @import("text_site_edit.zig").bytePosition(text, std.math.cast(u32, high - span.site_start_unit) orelse return error.LimitExceeded);
        }
        const pieces = @import("character_style_selection.zig").split(Span, span, start, end, id);
        for (pieces.items[0..pieces.len]) |piece| try append(a, &output, piece, limit);
        cursor = span.end_unit;
    }
    return output.toOwnedSlice(a);
}

pub fn append(a: std.mem.Allocator, output: *std.ArrayList(Span), span: Span, limit: usize) !void {
    if (output.items.len > 0 and span.end_unit > span.start_unit) {
        const last = &output.items[output.items.len - 1];
        if (last.end_unit > last.start_unit and last.end_unit == span.start_unit and last.site_index == span.site_index and last.site_start_unit == span.site_start_unit and last.run_element == span.run_element and last.char_shape_id == span.char_shape_id and last.tab_element == span.tab_element and last.anchor_element == span.anchor_element and last.canonical_fragment == span.canonical_fragment) {
            last.end_unit = span.end_unit;
            return;
        }
    }
    if (output.items.len >= limit) return error.LimitExceeded;
    try output.append(a, span);
}
