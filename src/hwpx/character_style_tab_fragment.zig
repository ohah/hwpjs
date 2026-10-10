//! One typed text/tab fragment, not a complete run assembler.
//! Caller retains surrounding run content and namespace context.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Span = @import("character_style_tab_projection.zig").Span;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn write(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize) ![]u8 {
    return writeMode(a, tree, sites, span, limit, false);
}

pub fn writeForProtectedRun(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize) ![]u8 {
    return writeMode(a, tree, sites, span, limit, true);
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize, allow_anchors: bool) ![]u8 {
    var owned_text: ?[]u8 = null;
    defer if (owned_text) |text| a.free(text);
    var text_index: usize = undefined;
    var payload: []const u8 = undefined;
    switch (span.owner) {
        .tab_element => |index| {
            if (span.end_unit < span.start_unit or span.end_unit - span.start_unit != 1) return error.InvalidTextSites;
            if (!@import("retained_inline_unit.zig").supported(tree, index)) return error.UnsupportedInlineControl;
            text_index = tree.elements[index].parent orelse return error.SourceBindingMismatch;
            payload = tree.sourceOf(index);
        },
        .text_site => |index| {
            if (index >= sites.items.len) return error.InvalidTextSites;
            const site = sites.items[index];
            if (site.missing_text or site.anchor_boundary) return error.UnsupportedTextSite;
            text_index = site.element_index;
            if (span.start_unit < span.site_start_unit or span.end_unit < span.start_unit) return error.InvalidTextPosition;
            const low = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.start_unit - span.site_start_unit) orelse return error.LimitExceeded);
            const high = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.end_unit - span.site_start_unit) orelse return error.LimitExceeded);
            if (site.empty_element) {
                if (site.element_index >= tree.elements.len) return error.SourceBindingMismatch;
                const node = tree.elements[site.element_index];
                if (node.end_tag != null or site.start != node.start_tag.start or site.end != node.start_tag.end) return error.SourceBindingMismatch;
                const raw = tree.sourceOf(site.element_index);
                owned_text = if (low == high) try a.dupe(u8, raw) else try @import("xml_source_writer.zig").write(a, raw, &.{.{ .start = 0, .end = raw.len, .text = site.text[low..high], .expand_empty_element = true }}, limit);
            } else owned_text = try @import("../xml/text_writer.zig").encode(a, site.text[low..high], limit);
            payload = owned_text.?;
        },
    }
    if (text_index >= tree.elements.len) return error.SourceBindingMismatch;
    const text = tree.elements[text_index];
    if (!text.is(uri, "t")) return error.SourceBindingMismatch;
    const text_end = text.end_tag;
    if (text_end == null) switch (span.owner) {
        .text_site => |index| if (!sites.items[index].empty_element) return error.SourceBindingMismatch,
        .tab_element => return error.SourceBindingMismatch,
    };
    const run_index = text.parent orelse return error.SourceBindingMismatch;
    if (!tree.elements[run_index].is(uri, "run")) return error.SourceBindingMismatch;
    const run = tree.elements[run_index];
    const run_end = run.end_tag orelse return error.SourceBindingMismatch;
    var child = run.first_child;
    while (child) |index| {
        if (!tree.elements[index].is(uri, "t") and !@import("retained_run_metadata.zig").supported(tree, index) and !@import("retained_bookmark.zig").directSupported(tree, index) and !(allow_anchors and @import("run_anchor.zig").kind(tree, index) != null)) return error.UnsupportedInlineControl;
        child = tree.elements[index].next_sibling;
    }
    const opening = if (span.char_shape_id) |id| try @import("character_style_tag.zig").write(a, tree, run_index, id, limit) else try a.dupe(u8, tree.source[run.start_tag.start..run.start_tag.end]);
    defer a.free(opening);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for ([_][]const u8{ opening, if (text_end != null) tree.source[text.start_tag.start..text.start_tag.end] else "", payload, if (text_end) |ending| tree.source[ending.start..ending.end] else "", tree.source[run_end.start..run_end.end] }) |part| {
        if (part.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, part);
    }
    return output.toOwnedSlice(a);
}
