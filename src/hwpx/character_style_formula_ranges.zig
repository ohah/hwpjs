//! Numeric display rebasing from ephemeral formula result replacements.
const std = @import("std");
const paint = @import("character_style_paint.zig");
const Sites = @import("text_sites.zig").Sites;
const Range = @import("character_style_display_ranges.zig").Range;
pub const Replacement = struct { site_index: usize, text: []const u8 };

pub fn rebase(a: std.mem.Allocator, sites: *const Sites, current: []const paint.Span, replacements: []const Replacement, limit: usize) ![]Range {
    if (current.len > limit) return error.LimitExceeded;
    for (replacements, 0..) |replacement, index| {
        if (replacement.site_index >= sites.items.len) return error.InvalidTextSites;
        for (replacements[0..index]) |previous| if (previous.site_index == replacement.site_index) return error.AmbiguousFormulaResultSite;
        var groups: usize = 0;
        var inside = false;
        for (current) |span| {
            const matches = span.anchor_element == null and span.tab_element == null and span.site_index == replacement.site_index;
            if (matches and !inside) groups += 1;
            inside = matches;
        }
        if (groups != 1) return error.InvalidTextSites;
    }
    const output = try a.alloc(Range, current.len);
    errdefer a.free(output);
    var old_cursor: usize = 0;
    var cursor: usize = 0;
    var index: usize = 0;
    while (index < current.len) {
        const first = current[index];
        if (first.start_unit != old_cursor or first.end_unit < old_cursor) return error.InvalidTextSites;
        if (first.anchor_element != null or first.tab_element != null) {
            if (first.anchor_element != null and first.tab_element != null) return error.InvalidTextSites;
            if (first.end_unit - old_cursor != 1) return error.InvalidTextSites;
            output[index] = .{ .start_unit = cursor, .end_unit = std.math.add(usize, cursor, 1) catch return error.LimitExceeded, .char_shape_id = first.char_shape_id, .inline_element = first.tab_element };
            cursor = output[index].end_unit;
            old_cursor = first.end_unit;
            index += 1;
            continue;
        }
        if (first.site_index >= sites.items.len or first.site_start_unit != first.start_unit) return error.InvalidTextSites;
        var replacement: ?[]const u8 = null;
        for (replacements) |value| if (value.site_index == first.site_index) {
            replacement = value.text;
        };
        var last = index;
        while (last < current.len and current[last].anchor_element == null and current[last].tab_element == null and current[last].site_index == first.site_index) : (last += 1) {
            const span = current[last];
            if (span.start_unit != old_cursor or span.end_unit < old_cursor or span.site_start_unit != first.site_start_unit or span.run_element != first.run_element) return error.InvalidTextSites;
            _ = try @import("text_site_edit.zig").bytePosition(sites.items[first.site_index].text, std.math.cast(u32, span.end_unit - first.site_start_unit) orelse return error.LimitExceeded);
            const width = if (replacement) |text| (if (last == index) try @import("text_site_edit.zig").utf16Length(text) else 0) else span.end_unit - span.start_unit;
            output[last] = .{ .start_unit = cursor, .end_unit = std.math.add(usize, cursor, width) catch return error.LimitExceeded, .char_shape_id = span.char_shape_id };
            cursor = output[last].end_unit;
            old_cursor = span.end_unit;
        }
        if (old_cursor - first.site_start_unit != try @import("text_site_edit.zig").utf16Length(sites.items[first.site_index].text)) return error.InvalidTextSites;
        index = last;
    }
    return output;
}

test "HWPX formula display ranges rebase split styles and clear later result fragments" {
    const a = std.testing.allocator;
    var rows = [_]@import("text_sites.zig").Site{ .{ .element_index = 1, .start = 0, .end = 4, .text = @constCast("68.3") }, .{ .element_index = 2, .start = 4, .end = 4, .text = @constCast("") } };
    const sites: Sites = .{ .items = &rows };
    const spans = [_]paint.Span{
        .{ .start_unit = 0, .end_unit = 2, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 7 },
        .{ .start_unit = 2, .end_unit = 4, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 9 },
        .{ .start_unit = 4, .end_unit = 4, .site_start_unit = 4, .site_index = 1, .run_element = 0, .char_shape_id = null },
    };
    const replacements = [_]Replacement{ .{ .site_index = 0, .text = "156.3" }, .{ .site_index = 1, .text = "" } };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Sites, styles: []const paint.Span, values: []const Replacement) !void {
            const output = try rebase(allocator, input, styles, values, 10);
            defer allocator.free(output);
            try std.testing.expectEqualDeep(&[_]Range{ .{ .start_unit = 0, .end_unit = 5, .char_shape_id = 7 }, .{ .start_unit = 5, .end_unit = 5, .char_shape_id = 9 }, .{ .start_unit = 5, .end_unit = 5, .char_shape_id = null } }, output);
            try std.testing.expectEqualStrings("68.3", input.items[0].text);
        }
    };
    try Probe.run(a, &sites, &spans, &replacements);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &sites, &spans, &replacements });
    try std.testing.expectError(error.AmbiguousFormulaResultSite, rebase(a, &sites, &spans, &.{ replacements[0], replacements[0] }, 10));
    try std.testing.expectError(error.LimitExceeded, rebase(a, &sites, &spans, &replacements, 1));
    try std.testing.expectError(error.InvalidTextSites, rebase(a, &sites, spans[0..2], &replacements, 10));
    try std.testing.expectError(error.InvalidTextSites, rebase(a, &sites, &.{ spans[0], spans[2], spans[1] }, &replacements, 10));
}

test "HWPX formula display ranges preserve protected units and Unicode suffix positions" {
    const a = std.testing.allocator;
    var rows = [_]@import("text_sites.zig").Site{
        .{ .element_index = 1, .start = 0, .end = 1, .text = @constCast("9") },
        .{ .element_index = 3, .start = 1, .end = 6, .text = @constCast("😀Z") },
    };
    const sites: Sites = .{ .items = &rows };
    const spans = [_]paint.Span{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 0 },
        .{ .start_unit = 1, .end_unit = 2, .site_start_unit = 1, .site_index = std.math.maxInt(usize), .run_element = 0, .char_shape_id = null, .anchor_element = 2 },
        .{ .start_unit = 2, .end_unit = 5, .site_start_unit = 2, .site_index = 1, .run_element = 0, .char_shape_id = 7 },
    };
    const output = try rebase(a, &sites, &spans, &.{.{ .site_index = 0, .text = "100" }}, 10);
    defer a.free(output);
    try std.testing.expectEqualDeep(&[_]Range{
        .{ .start_unit = 0, .end_unit = 3, .char_shape_id = 0 },
        .{ .start_unit = 3, .end_unit = 4, .char_shape_id = null },
        .{ .start_unit = 4, .end_unit = 7, .char_shape_id = 7 },
    }, output);
    var invalid = spans;
    invalid[2].end_unit = 3;
    try std.testing.expectError(error.SplitSurrogatePair, rebase(a, &sites, &invalid, &.{.{ .site_index = 0, .text = "100" }}, 10));
}

test "HWPX formula display ranges retain tab provenance after result expansion" {
    var rows = [_]@import("text_sites.zig").Site{
        .{ .element_index = 1, .start = 0, .end = 1, .text = @constCast("9") },
        .{ .element_index = 3, .start = 1, .end = 6, .text = @constCast("😀Z") },
    };
    const sites: Sites = .{ .items = &rows };
    const spans = [_]paint.Span{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 0 },
        .{ .start_unit = 1, .end_unit = 2, .site_start_unit = 1, .site_index = std.math.maxInt(usize), .run_element = 0, .char_shape_id = null, .tab_element = 2 },
        .{ .start_unit = 2, .end_unit = 5, .site_start_unit = 2, .site_index = 1, .run_element = 0, .char_shape_id = 7 },
    };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Sites, styles: []const paint.Span) !void {
            const result = try rebase(allocator, input, styles, &.{.{ .site_index = 0, .text = "100😀" }}, 10);
            defer allocator.free(result);
            try std.testing.expectEqualDeep(&[_]Range{
                .{ .start_unit = 0, .end_unit = 5, .char_shape_id = 0 },
                .{ .start_unit = 5, .end_unit = 6, .char_shape_id = null, .inline_element = 2 },
                .{ .start_unit = 6, .end_unit = 9, .char_shape_id = 7 },
            }, result);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &sites, &spans });
}
