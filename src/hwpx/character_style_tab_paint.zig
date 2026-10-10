//! Candidate selection over typed tab provenance; no text mutation or commit.
const std = @import("std");
const Span = @import("character_style_tab_projection.zig").Span;
const Sites = @import("text_sites.zig").Sites;

pub fn prepare(a: std.mem.Allocator, sites: *const Sites, current: []const Span, start: u32, end: u32, id: u32, ids: []const u32, limit: usize) ![]Span {
    if (std.mem.indexOfScalar(u32, ids, id) == null) return error.InvalidResourceReference;
    if (current.len == 0 or start > end or end > current[current.len - 1].end_unit) return error.InvalidTextPosition;
    var output: std.ArrayList(Span) = .empty;
    defer output.deinit(a);
    var cursor: usize = 0;
    for (current) |span| {
        if (span.start_unit != cursor or span.end_unit < cursor or span.site_start_unit > span.start_unit) return error.InvalidTextSites;
        switch (span.owner) {
            .text_site => |index| {
                if (index >= sites.items.len) return error.InvalidTextSites;
                const text = sites.items[index].text;
                for ([_]usize{ span.start_unit, span.end_unit, @max(span.start_unit, @min(span.end_unit, start)), @max(span.start_unit, @min(span.end_unit, end)) }) |boundary|
                    _ = try @import("text_site_edit.zig").bytePosition(text, std.math.cast(u32, boundary - span.site_start_unit) orelse return error.LimitExceeded);
            },
            .tab_element => if (span.end_unit - span.start_unit != 1) return error.InvalidTextSites,
        }
        const pieces = @import("character_style_selection.zig").split(Span, span, if (span.char_shape_id == id) 0 else start, if (span.char_shape_id == id) 0 else end, id);
        for (pieces.items[0..pieces.len]) |piece| try append(a, &output, piece, limit);
        cursor = span.end_unit;
    }
    return output.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, output: *std.ArrayList(Span), span: Span, limit: usize) !void {
    if (output.items.len > 0) {
        const previous = &output.items[output.items.len - 1];
        if (previous.end_unit == span.start_unit and previous.site_start_unit == span.site_start_unit and
            previous.char_shape_id == span.char_shape_id and std.meta.eql(previous.owner, span.owner))
        {
            previous.end_unit = span.end_unit;
            return;
        }
    }
    if (output.items.len >= limit) return error.LimitExceeded;
    try output.append(a, span);
}
