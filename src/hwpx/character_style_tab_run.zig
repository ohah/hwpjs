//! Complete typed text/tab coverage for one source run, before serialization.
const std = @import("std");
const typed = @import("character_style_tab_projection.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn write(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, run_index: usize, original: []const typed.Span, current: []const typed.Span, limit: usize) ![]u8 {
    return writeTitles(a, tree, sites, run_index, original, current, limit, null);
}
pub fn writeTitles(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, run_index: usize, original: []const typed.Span, current: []const typed.Span, limit: usize, titles: ?[]const @import("title_mark_position.zig").Position) ![]u8 {
    if (run_index >= tree.elements.len or !tree.elements[run_index].is(uri, "run")) return error.SourceBindingMismatch;
    if (!@import("element_whitespace_gaps.zig").empty(tree, run_index)) return error.UnsupportedInlineControl;
    const retained = try @import("character_style_retained_sites.zig").collectOwned(a, tree, run_index, titles);
    defer a.free(retained);
    var count: usize = 0;
    for (sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        if (tree.elements[site.element_index].parent == run_index) count += 1;
    }
    var child = tree.elements[run_index].first_child;
    while (child) |index| {
        if (!tree.elements[index].is(uri, "t")) {
            if (!@import("retained_run_metadata.zig").supported(tree, index) and !@import("retained_bookmark.zig").directSupported(tree, index)) return error.UnsupportedInlineControl;
            child = tree.elements[index].next_sibling;
            continue;
        }
        const raw_text = tree.sourceOf(index);
        if (std.mem.indexOf(u8, raw_text, "<!--") != null or std.mem.indexOf(u8, raw_text, "<?") != null) return error.UnsupportedInlineControl;
        var inline_child = tree.elements[index].first_child;
        while (inline_child) |inline_index| {
            if (@import("title_mark_axis.zig").retained(tree, inline_index)) {
                inline_child = tree.elements[inline_index].next_sibling;
                continue;
            }
            if (!@import("retained_inline_unit.zig").supported(tree, inline_index)) return error.UnsupportedInlineControl;
            count += 1;
            inline_child = tree.elements[inline_index].next_sibling;
        }
        child = tree.elements[index].next_sibling;
    }
    if (original.len == 0 or original.len != count) return error.SourceBindingMismatch;
    var owners: std.AutoHashMap(typed.Owner, void) = .init(a);
    defer owners.deinit();
    var next: usize = 0;
    var cursor = original[0].start_unit;
    for (original) |base| {
        if (base.start_unit != cursor or base.site_start_unit != base.start_unit or base.end_unit < cursor) return error.InvalidTextSites;
        const text_index = switch (base.owner) {
            .text_site => |index| block: {
                if (index >= sites.items.len) return error.InvalidTextSites;
                if (try @import("text_site_edit.zig").utf16Length(sites.items[index].text) != base.end_unit - base.start_unit) return error.InvalidTextSites;
                break :block sites.items[index].element_index;
            },
            .tab_element => |index| block: {
                if (index >= tree.elements.len or base.end_unit - base.start_unit != 1 or !@import("retained_inline_unit.zig").supported(tree, index)) return error.InvalidTextSites;
                break :block tree.elements[index].parent orelse return error.SourceBindingMismatch;
            },
        };
        if (text_index >= tree.elements.len or tree.elements[text_index].parent != run_index) return error.SourceBindingMismatch;
        const entry = try owners.getOrPut(base.owner);
        if (entry.found_existing) return error.SourceBindingMismatch;
        const first = next;
        while (next < current.len and std.meta.eql(current[next].owner, base.owner)) : (next += 1) {
            const span = current[next];
            if (span.start_unit != cursor or span.end_unit < cursor or span.end_unit > base.end_unit or span.site_start_unit != base.site_start_unit) return error.InvalidTextSites;
            if (next > first and span.end_unit == span.start_unit) return error.InvalidTextSites;
            cursor = span.end_unit;
        }
        if (next == first or cursor != base.end_unit) return error.InvalidTextSites;
    }
    if (next != current.len) return error.InvalidTextSites;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var retained_cursor: usize = 0;
    for (current) |span| {
        const boundary = switch (span.owner) {
            .text_site => |index| sites.items[index].start,
            .tab_element => |index| tree.elements[index].start_tag.start,
        };
        try @import("character_style_retained_emit.zig").before(a, tree, run_index, retained, &retained_cursor, boundary, &output, limit);
        const fragment = try @import("character_style_tab_fragment.zig").write(a, tree, sites, span, limit -| output.items.len);
        defer a.free(fragment);
        try output.appendSlice(a, fragment);
    }
    try @import("character_style_retained_emit.zig").before(a, tree, run_index, retained, &retained_cursor, tree.source.len, &output, limit);
    return output.toOwnedSlice(a);
}
