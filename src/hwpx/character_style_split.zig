//! Clip current style provenance onto a split text draft, without text copies.
const std = @import("std");
const Sites = @import("text_sites.zig").Sites;
const paint = @import("character_style_paint.zig");
pub fn side(a: std.mem.Allocator, current: []const paint.Span, original: *const Sites, selected: *const Sites, boundary: u32, right: bool, max_spans: usize) ![]paint.Span {
    if (original.items.len != selected.items.len) return error.InvalidTextSites;
    var output: std.ArrayList(paint.Span) = .empty;
    defer output.deinit(a);
    var index: usize = 0;
    var old_base: usize = 0;
    var new_base: usize = 0;
    for (original.items, selected.items, 0..) |before, after, site_index| {
        const old_length = try @import("text_site_edit.zig").utf16Length(before.text);
        const old_end = std.math.add(usize, old_base, old_length) catch return error.LimitExceeded;
        const cut = std.math.clamp(@as(usize, boundary), old_base, old_end);
        const low = if (right) cut else old_base;
        const high = if (right) old_end else cut;
        if (try @import("text_site_edit.zig").utf16Length(after.text) != high - low) return error.InvalidTextSites;
        if (index >= current.len) return error.InvalidTextSites;
        const first = current[index];
        var affinity = first;
        var found_affinity = false;
        var cursor = old_base;
        const count_before = output.items.len;
        while (index < current.len and current[index].site_index == site_index) : (index += 1) {
            const span = current[index];
            if (span.site_start_unit != old_base or span.start_unit != cursor or span.end_unit < cursor or span.end_unit > old_end or span.run_element != first.run_element) return error.InvalidTextSites;
            _ = try @import("text_site_edit.zig").bytePosition(before.text, std.math.cast(u32, span.end_unit - old_base) orelse return error.LimitExceeded);
            if (!found_affinity and cut >= span.start_unit and cut <= span.end_unit) {
                affinity = span;
                found_affinity = true;
            }
            const start = @max(span.start_unit, low);
            const end = @min(span.end_unit, high);
            if (start < end) {
                var clipped = span;
                clipped.start_unit = new_base + start - low;
                clipped.end_unit = new_base + end - low;
                clipped.site_start_unit = new_base;
                try paint.append(a, &output, clipped, max_spans);
            }
            cursor = span.end_unit;
        }
        if (cursor != old_end or !found_affinity) return error.InvalidTextSites;
        if (output.items.len == count_before) {
            affinity.start_unit = new_base;
            affinity.end_unit = new_base;
            affinity.site_start_unit = new_base;
            try paint.append(a, &output, affinity, max_spans);
        }
        new_base = std.math.add(usize, new_base, high - low) catch return error.LimitExceeded;
        old_base = old_end;
    }
    if (index != current.len) return error.InvalidTextSites;
    return output.toOwnedSlice(a);
}
