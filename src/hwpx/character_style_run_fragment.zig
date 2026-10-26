//! Emit a current styled fragment of a single text-only source run.
//! Parent namespace context remains the caller's responsibility.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Span = @import("character_style_paint.zig").Span;

pub fn write(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize) ![]u8 {
    return writeMode(a, tree, sites, span, limit, true, true);
}

pub fn writeMode(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize, keep_prefix: bool, keep_suffix: bool) ![]u8 {
    return writePolicy(a, tree, sites, span, limit, keep_prefix, keep_suffix, null, &.{}, false);
}

/// 필드 좌표/연결 권한은 호출자가 검증하며 현재 소유한 ctrl만 보존합니다.
pub fn writeFields(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize, keep_prefix: bool, keep_suffix: bool, owned: []const @import("field_position.zig").Position) ![]u8 {
    return writePolicy(a, tree, sites, span, limit, keep_prefix, keep_suffix, owned, &.{}, false);
}

pub fn writeFieldsDirty(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize, keep_prefix: bool, keep_suffix: bool, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty) ![]u8 {
    return writePolicy(a, tree, sites, span, limit, keep_prefix, keep_suffix, owned, fields, false);
}

pub fn writeFieldsCurrent(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize, keep_prefix: bool, keep_suffix: bool, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool) ![]u8 {
    return writePolicy(a, tree, sites, span, limit, keep_prefix, keep_suffix, owned, fields, continuation);
}

fn writePolicy(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, span: Span, limit: usize, keep_prefix: bool, keep_suffix: bool, owned_fields: ?[]const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool) ![]u8 {
    for (fields, 0..) |field, index| {
        for (fields[0..index]) |previous| if (previous.element_index == field.element_index) return error.DuplicateFieldDirty;
        if (field.element_index >= tree.elements.len) return error.InvalidElementIndex;
        if (!tree.elements[field.element_index].is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return error.InvalidFieldElement;
    }
    if (span.site_index >= sites.items.len or span.run_element >= tree.elements.len) return error.InvalidTextSites;
    const site = sites.items[span.site_index];
    if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
    const run = tree.elements[span.run_element];
    const text = tree.elements[site.element_index];
    const uri = @import("document_xml.zig").paragraph_uri;
    if (site.anchor_boundary) {
        if (site.element_index != span.run_element or span.start_unit < span.site_start_unit or span.end_unit < span.start_unit) return error.SourceBindingMismatch;
        return @import("character_style_anchor_boundary_fragment.zig").write(a, tree, site, span.start_unit - span.site_start_unit, span.end_unit - span.site_start_unit, span.char_shape_id, limit);
    }
    if (site.missing_text) {
        if (owned_fields) |owned| return @import("character_style_missing_run.zig").writeFieldsCurrent(a, tree, sites, span, limit, keep_prefix, owned, fields, continuation);
        return @import("character_style_missing_run.zig").write(a, tree, sites, span, limit, keep_prefix);
    }
    if (!run.is(uri, "run") or !text.is(uri, "t") or text.parent != span.run_element) return error.SourceBindingMismatch;
    if (text.first_child != null) return error.UnsupportedInlineControl;
    var child = run.first_child;
    var found = false;
    var prefix_start = run.start_tag.end;
    const paragraph_index = run.parent orelse return error.SourceBindingMismatch;
    var first_text_start = tree.source.len;
    for (sites.items) |candidate| {
        if (candidate.element_index >= tree.elements.len) return error.InvalidTextSites;
        const candidate_element = tree.elements[candidate.element_index];
        const candidate_run = if (candidate.missing_text) candidate.element_index else candidate_element.parent orelse continue;
        if (tree.elements[candidate_run].parent == paragraph_index and !candidate.anchor_boundary) first_text_start = @min(first_text_start, candidate.start);
    }
    while (child) |index| {
        if (index == site.element_index) {
            found = true;
        } else if (tree.elements[index].is(uri, "t") and tree.elements[index].first_child == null) {
            if (!found) prefix_start = tree.elements[index].end;
            if (found and keep_suffix) return error.SourceBindingMismatch;
        } else if (!(owned_fields != null and tree.elements[index].is(uri, "secPr")) and !@import("retained_field_marker.zig").supported(tree, index) and
            !@import("retained_run_metadata.zig").supported(tree, index) and
            !@import("retained_note_number.zig").supported(tree, index, paragraph_index, first_text_start)) return error.UnsupportedInlineControl;
        child = tree.elements[index].next_sibling;
    }
    if (!found) return error.SourceBindingMismatch;
    if (site.missing_text or site.anchor_boundary) return error.UnsupportedTextSite;
    if (site.empty_element) {
        if (text.end_tag != null or site.start != text.start_tag.start or site.end != text.start_tag.end) return error.SourceBindingMismatch;
    } else {
        const ending = text.end_tag orelse return error.SourceBindingMismatch;
        if (site.start != text.start_tag.end or site.end != ending.start) return error.SourceBindingMismatch;
    }
    if (span.start_unit < span.site_start_unit or span.end_unit < span.start_unit) return error.InvalidTextPosition;
    const start = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.start_unit - span.site_start_unit) orelse return error.LimitExceeded);
    const end = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.end_unit - span.site_start_unit) orelse return error.LimitExceeded);
    const opening = try @import("character_style_tag.zig").writeSelected(a, tree, span.run_element, span.char_shape_id, limit);
    defer a.free(opening);
    const base = run.start_tag.start;
    const Change = @import("xml_source_writer.zig").Change;
    var changes: std.ArrayList(Change) = .empty;
    defer changes.deinit(a);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    try changes.append(a, .{ .start = 0, .end = run.start_tag.end - base, .text = "", .start_tag = opening });
    if (!keep_prefix and text.start_tag.start > run.start_tag.end) {
        try changes.append(a, .{ .start = run.start_tag.end - base, .end = text.start_tag.start - base, .text = "" });
    } else if (keep_prefix and prefix_start > run.start_tag.end) {
        // Earlier text sites were emitted by the run assembler. Keep only
        // the inter-site metadata belonging to this site's first fragment.
        try changes.append(a, .{ .start = run.start_tag.end - base, .end = prefix_start - base, .text = "" });
    }
    // Preserve an unchanged empty tag byte-for-byte; materialization uses the
    // same validated empty-element writer as ordinary text-site saving.
    if (!site.empty_element or end != start) {
        try changes.append(a, .{ .start = site.start - base, .end = site.end - base, .text = site.text[start..end], .expand_empty_element = site.empty_element });
    }
    const run_ending = run.end_tag orelse return error.SourceBindingMismatch;
    if (!keep_suffix and run_ending.start > text.end) {
        try changes.append(a, .{ .start = text.end - base, .end = run_ending.start - base, .text = "" });
    }
    if (owned_fields) |owned| {
        const prefix: @import("field_style_control_changes.zig").Range = if (keep_prefix) .{ .start = prefix_start, .end = text.start_tag.start } else .{ .start = 0, .end = 0 };
        const suffix: @import("field_style_control_changes.zig").Range = if (keep_suffix) .{ .start = text.end, .end = run_ending.start } else .{ .start = 0, .end = 0 };
        try @import("field_style_control_changes.zig").append(a, tree, span.run_element, &.{ prefix, suffix }, owned, fields, continuation, &changes, &tags, limit);
    }
    std.mem.sort(Change, changes.items, {}, struct {
        fn less(_: void, left: Change, right: Change) bool {
            return left.start < right.start;
        }
    }.less);
    return @import("xml_source_writer.zig").write(a, tree.sourceOf(span.run_element), changes.items, limit);
}
