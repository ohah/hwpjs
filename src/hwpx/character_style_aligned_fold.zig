//! Rebase paired aligned sites, retaining style and empty-site affinity.
const std = @import("std");
const paint = @import("character_style_paint.zig");
pub fn prepare(a: std.mem.Allocator, current: *const @import("paragraph_joined_values.zig").Joined, count: usize) !?[]paint.Span {
    const styles = current.character_styles orelse return null;
    var right: usize = 0;
    while (right < styles.len and styles[right].site_index < count) : (right += 1) {}
    var left: usize = 0;
    const middle = right;
    var output: std.ArrayList(paint.Span) = .empty;
    defer output.deinit(a);
    var base: usize = 0;
    for (0..count) |site_index| {
        const left_start = left;
        const right_start = right;
        while (left < middle and styles[left].site_index == site_index) : (left += 1) {}
        while (right < styles.len and styles[right].site_index == count + site_index) : (right += 1) {}
        if (left == left_start or right == right_start) return error.InvalidTextSites;
        const one = styles[left_start..left];
        const two = styles[right_start..right];
        const first_length = try @import("text_site_edit.zig").utf16Length(current.sites.items[site_index].text);
        const second_length = try @import("text_site_edit.zig").utf16Length(current.sites.items[count + site_index].text);
        // Dropping a different empty boundary ID changes insertion affinity.
        if (first_length == 0 and one[0].char_shape_id != two[0].char_shape_id) return null;
        if (second_length == 0 and two[0].char_shape_id != one[one.len - 1].char_shape_id) return null;
        const before = output.items.len;
        for ([_][]const paint.Span{ one, two }, 0..) |group, side| {
            const offset = if (side == 0) 0 else first_length;
            for (group) |span| {
                if (span.start_unit < span.site_start_unit or span.end_unit < span.start_unit) return error.InvalidTextSites;
                if (span.end_unit == span.start_unit) continue;
                var mapped = span;
                mapped.site_index = site_index;
                mapped.site_start_unit = base;
                const local_start = std.math.add(usize, offset, span.start_unit - span.site_start_unit) catch return error.LimitExceeded;
                const local_end = std.math.add(usize, offset, span.end_unit - span.site_start_unit) catch return error.LimitExceeded;
                mapped.start_unit = std.math.add(usize, base, local_start) catch return error.LimitExceeded;
                mapped.end_unit = std.math.add(usize, base, local_end) catch return error.LimitExceeded;
                try paint.append(a, &output, mapped, 1_000_000);
            }
        }
        if (output.items.len == before) {
            var empty = one[0];
            empty.site_index = site_index;
            empty.start_unit = base;
            empty.end_unit = base;
            empty.site_start_unit = base;
            try paint.append(a, &output, empty, 1_000_000);
        }
        base = std.math.add(usize, base, std.math.add(usize, first_length, second_length) catch return error.LimitExceeded) catch return error.LimitExceeded;
    }
    if (left != middle or right != styles.len) return error.InvalidTextSites;
    return try output.toOwnedSlice(a);
}
