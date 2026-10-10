//! 공통 텍스트 서식 clipping과 현재 개체 귀속을 함께 적용합니다.
const std = @import("std");
const Sites = @import("text_sites.zig").Sites;
const paint = @import("character_style_paint.zig");
const Segment = @import("paragraph_text_positions.zig").Segment;

pub fn side(a: std.mem.Allocator, styles: []const paint.Span, original: *const Sites, selected: *const Sites, segments: []const Segment, boundary: u32, right: bool, limit: usize) ![]paint.Span {
    if (original.items.len != selected.items.len) return error.InvalidTextSites;
    try @import("paragraph_text_positions.zig").validateRange(segments, boundary, boundary);
    var output: std.ArrayList(paint.Span) = .empty;
    defer output.deinit(a);
    var index: usize = 0;
    var cursor: usize = 0;
    for (segments) |segment| {
        if (index >= styles.len) return error.InvalidTextSites;
        if (segment.kind != .text) {
            if (segment.end_unit < segment.start_unit or segment.end_unit - segment.start_unit != 1) return error.InvalidTextSites;
            var span = styles[index];
            if ((if (segment.kind == .anchor) span.anchor_element else span.tab_element) != segment.index or span.start_unit != segment.start_unit or span.end_unit != segment.end_unit) return error.InvalidTextSites;
            index += 1;
            if (if (right) segment.start_unit < boundary else segment.end_unit > boundary) continue;
            span.start_unit = cursor;
            cursor = std.math.add(usize, cursor, 1) catch return error.LimitExceeded;
            span.end_unit = cursor;
            span.site_start_unit = span.start_unit;
            try paint.append(a, &output, span, limit);
            continue;
        }
        if (segment.index >= original.items.len or segment.end_unit < segment.start_unit) return error.InvalidTextSites;
        var local: std.ArrayList(paint.Span) = .empty;
        defer local.deinit(a);
        while (index < styles.len and styles[index].anchor_element == null and styles[index].tab_element == null and styles[index].site_index == segment.index) : (index += 1) {
            var span = styles[index];
            if (span.start_unit < segment.start_unit or span.end_unit > segment.end_unit or span.site_start_unit != segment.start_unit) return error.InvalidTextSites;
            span.start_unit -= segment.start_unit;
            span.end_unit -= segment.start_unit;
            span.site_start_unit = 0;
            span.site_index = 0;
            try local.append(a, span);
        }
        var before = [_]@import("text_sites.zig").Site{original.items[segment.index]};
        var after = [_]@import("text_sites.zig").Site{selected.items[segment.index]};
        const cut = std.math.cast(u32, std.math.clamp(@as(usize, boundary), segment.start_unit, segment.end_unit) - segment.start_unit) orelse return error.LimitExceeded;
        const clipped = try @import("character_style_split.zig").side(a, local.items, &.{ .items = &before }, &.{ .items = &after }, cut, right, limit);
        defer a.free(clipped);
        for (clipped) |value| {
            var span = value;
            span.start_unit = std.math.add(usize, cursor, value.start_unit) catch return error.LimitExceeded;
            span.end_unit = std.math.add(usize, cursor, value.end_unit) catch return error.LimitExceeded;
            span.site_start_unit = cursor;
            span.site_index = segment.index;
            try paint.append(a, &output, span, limit);
        }
        cursor = std.math.add(usize, cursor, clipped[clipped.len - 1].end_unit) catch return error.LimitExceeded;
    }
    if (index != styles.len) return error.InvalidTextSites;
    return output.toOwnedSlice(a);
}
