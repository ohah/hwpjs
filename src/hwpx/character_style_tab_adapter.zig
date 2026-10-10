//! Numeric adapter into the single owned Paragraph.character_styles model.
//! Typed candidates are transient; no parallel current-style owner is created.
const std = @import("std");
const paint = @import("character_style_paint.zig");
const typed = @import("character_style_tab_projection.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn fromTyped(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, input: []const typed.Span) ![]paint.Span {
    const output = try a.alloc(paint.Span, input.len);
    errdefer a.free(output);
    for (input, output) |span, *row| {
        if (span.end_unit < span.start_unit or span.site_start_unit > span.start_unit) return error.InvalidTextSites;
        var tab: ?usize = null;
        const site_index = switch (span.owner) {
            .text_site => |index| if (index < sites.items.len) index else return error.InvalidTextSites,
            .tab_element => |index| block: {
                if (span.end_unit - span.start_unit != 1) return error.InvalidTextSites;
                if (!@import("retained_inline_unit.zig").supported(tree, index)) return error.UnsupportedInlineControl;
                tab = index;
                break :block std.math.maxInt(usize);
            },
        };
        const text_index = if (tab) |index| tree.elements[index].parent orelse return error.SourceBindingMismatch else sites.items[site_index].element_index;
        if (text_index >= tree.elements.len) return error.SourceBindingMismatch;
        const missing = tab == null and sites.items[site_index].missing_text;
        if (!tree.elements[text_index].is(uri, if (missing) "run" else "t")) return error.SourceBindingMismatch;
        const run_index = if (missing) text_index else tree.elements[text_index].parent orelse return error.SourceBindingMismatch;
        if (!tree.elements[run_index].is(uri, "run")) return error.SourceBindingMismatch;
        row.* = .{ .start_unit = span.start_unit, .end_unit = span.end_unit, .site_start_unit = span.site_start_unit, .site_index = site_index, .run_element = run_index, .char_shape_id = span.char_shape_id, .tab_element = tab };
    }
    return output;
}

pub fn toTyped(a: std.mem.Allocator, input: []const paint.Span) ![]typed.Span {
    for (input) |span| if (span.anchor_element != null) return error.UnsupportedParagraphControl;
    const output = try a.alloc(typed.Span, input.len);
    for (input, output) |span, *row| row.* = .{ .start_unit = span.start_unit, .end_unit = span.end_unit, .site_start_unit = span.site_start_unit, .char_shape_id = span.char_shape_id, .owner = if (span.tab_element) |index| .{ .tab_element = index } else .{ .text_site = span.site_index } };
    return output;
}
