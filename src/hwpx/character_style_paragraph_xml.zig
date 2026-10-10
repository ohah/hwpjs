//! Save authoritative paragraph styles without changing immutable source XML.
const std = @import("std");
pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, limit: usize) ![]u8 {
    return writeFieldsDirty(a, tree, paragraph, &.{}, limit);
}

pub fn writeFieldsDirty(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize) ![]u8 {
    if (paragraph.pieces != null) return error.UnsupportedStructuralCharacterStyle;
    const spans = paragraph.character_styles orelse return error.InvalidTextSites;
    if (paragraph.template_element >= tree.elements.len) return error.InvalidParagraphElement;
    const node = tree.elements[paragraph.template_element];
    if (!node.is(@import("document_xml.zig").paragraph_uri, "p")) return error.InvalidParagraphElement;
    const writer = @import("xml_source_writer.zig");
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| if (change.serialized_xml) |bytes| a.free(bytes);
        changes.deinit(a);
    }
    var field_tags: std.ArrayList([]u8) = .empty;
    defer {
        for (field_tags.items) |tag| a.free(tag);
        field_tags.deinit(a);
    }
    if (paragraph.generated_id) |id| {
        const opening = try @import("paragraph_continuation_tag.zig").write(a, tree, paragraph.template_element, id, limit);
        errdefer a.free(opening);
        try changes.append(a, .{ .start = 0, .end = node.start_tag.end - node.start_tag.start, .text = "", .serialized_xml = opening });
    }
    var index: usize = 0;
    var site_index: usize = 0;
    var units: usize = 0;
    while (index < spans.len) {
        const first = spans[index];
        if ((first.tab_element == null and first.anchor_element == null and first.site_index != site_index) or first.start_unit != units or first.run_element >= tree.elements.len) return error.InvalidTextSites;
        const run = tree.elements[first.run_element];
        if (run.parent != paragraph.template_element) return error.SourceBindingMismatch;
        var end = index + 1;
        while (end < spans.len and spans[end].run_element == first.run_element) : (end += 1) {}
        var next_site = site_index;
        var previous_site: ?usize = null;
        var has_tab = false;
        var has_anchor = false;
        for (spans[index..end]) |span| {
            if (span.anchor_element != null) {
                has_anchor = true;
                continue;
            }
            if (span.tab_element != null) {
                has_tab = true;
                continue;
            }
            if (previous_site == null or previous_site.? != span.site_index) {
                if (span.site_index != next_site) return error.InvalidTextSites;
                next_site += 1;
                previous_site = span.site_index;
            }
        }
        const xml = if (has_anchor or paragraph.protected_positions != null)
            try @import("character_style_anchor_save.zig").writeRun(a, tree, paragraph, spans[index..end], first.run_element, limit)
        else if (has_tab)
            try @import("character_style_tab_save.zig").writeRun(a, tree, paragraph, spans[index..end], first.run_element, limit)
        else if (paragraph.field_positions) |owned|
            try @import("character_style_run_xml.zig").writeFieldsCurrent(a, tree, &paragraph.sites, spans[index..end], owned, fields, paragraph.generated_id != null, limit)
        else
            try @import("character_style_run_xml.zig").write(a, tree, &paragraph.sites, spans[index..end], limit);
        errdefer a.free(xml);
        try changes.append(a, .{ .start = run.start_tag.start - node.start_tag.start, .end = run.end - node.start_tag.start, .text = "", .serialized_xml = xml });
        units = spans[end - 1].end_unit;
        site_index = next_site;
        index = end;
    }
    if (site_index != paragraph.sites.items.len) return error.InvalidTextSites;
    if (paragraph.field_positions) |owned| {
        for (tree.elements, 0..) |run, run_index| {
            if (!run.is(@import("document_xml.zig").paragraph_uri, "run") or run.parent != paragraph.template_element or run.end_tag == null) continue;
            var replaced = false;
            for (spans) |span| if (span.run_element == run_index) {
                replaced = true;
            };
            if (replaced) continue;
            var extra: std.ArrayList(writer.Change) = .empty;
            defer extra.deinit(a);
            try @import("field_style_control_changes.zig").append(a, tree, run_index, &.{.{ .start = run.start_tag.end, .end = run.end_tag.?.start }}, owned, fields, paragraph.generated_id != null, &extra, &field_tags, limit);
            const shift = run.start_tag.start - node.start_tag.start;
            for (extra.items) |change| {
                var moved = change;
                moved.start += shift;
                moved.end += shift;
                try changes.append(a, moved);
            }
        }
    }
    var removed_end = node.start_tag.end;
    for (tree.elements, 0..) |element, element_index| {
        if (element.start_tag.start < removed_end or element.end > node.end) continue;
        if (paragraph.protected_positions != null or paragraph.field_positions != null) {
            const parent = element.parent orelse continue;
            if (parent != paragraph.template_element and !(tree.elements[parent].is(@import("document_xml.zig").paragraph_uri, "run") and tree.elements[parent].parent == paragraph.template_element)) continue;
        }
        if (paragraph.field_positions != null and @import("retained_field_marker.zig").supported(tree, element_index)) continue;
        if (paragraph.field_positions != null) {
            if (element.parent) |parent| if (tree.elements[parent].is(@import("document_xml.zig").paragraph_uri, "run")) continue;
        }
        if (!@import("paragraph_continuation_metadata.zig").remove(element, paragraph.generated_id != null)) continue;
        var ancestor = element.parent;
        while (ancestor) |owner| {
            if (tree.elements[owner].is(@import("document_xml.zig").paragraph_uri, "p")) break;
            ancestor = tree.elements[owner].parent;
        }
        if (ancestor != paragraph.template_element) continue;
        const empty = try a.alloc(u8, 0);
        errdefer a.free(empty);
        try changes.append(a, .{ .start = element.start_tag.start - node.start_tag.start, .end = element.end - node.start_tag.start, .text = "", .serialized_xml = empty });
        removed_end = element.end;
    }
    try @import("title_mark_source_changes.zig").append(a, tree, paragraph, &changes);
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, tree.sourceOf(paragraph.template_element), changes.items, limit);
}
