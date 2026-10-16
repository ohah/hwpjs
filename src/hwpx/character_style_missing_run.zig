//! 공통 writer로 빈 run과 검증된 continuation 빈 사이트를 직렬화합니다.
const std = @import("std");
pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, span: @import("character_style_paint.zig").Span, limit: usize, keep_metadata: bool) ![]u8 {
    return writePolicy(a, tree, sites, span, limit, keep_metadata, null, &.{}, false);
}

pub fn writeFieldsCurrent(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, span: @import("character_style_paint.zig").Span, limit: usize, keep_metadata: bool, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool) ![]u8 {
    return writePolicy(a, tree, sites, span, limit, keep_metadata, owned, fields, continuation);
}

fn writePolicy(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, span: @import("character_style_paint.zig").Span, limit: usize, keep_metadata: bool, owned_fields: ?[]const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool) ![]u8 {
    if (span.site_index >= sites.items.len or span.run_element >= tree.elements.len) return error.InvalidTextSites;
    const site = sites.items[span.site_index];
    const run = tree.elements[span.run_element];
    if (site.anchor_boundary) return error.UnsupportedTextSite;
    if (!site.missing_text) return error.SourceBindingMismatch;
    if (site.element_index != span.run_element or !run.is(@import("document_xml.zig").paragraph_uri, "run")) return error.SourceBindingMismatch;
    const derived = if (run.parent) |owner| @import("continuation_empty_run.zig").valid(tree, owner, site) else false;
    const metadata_only = @import("retained_run_metadata.zig").paragraphOnly(tree, span.run_element);
    if (run.first_child != null and !derived and !metadata_only) return error.UnsupportedInlineControl;
    if (!derived and (site.empty_element != (run.end_tag == null) or site.start != (if (site.empty_element) run.start_tag.start else run.start_tag.end) or site.end != run.start_tag.end)) return error.SourceBindingMismatch;
    if (span.start_unit < span.site_start_unit or span.end_unit < span.start_unit) return error.InvalidTextPosition;
    const start = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.start_unit - span.site_start_unit) orelse return error.LimitExceeded);
    const end = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.end_unit - span.site_start_unit) orelse return error.LimitExceeded);
    const opening = if (span.char_shape_id) |id| try @import("character_style_tag.zig").write(a, tree, span.run_element, id, limit) else try a.dupe(u8, tree.source[run.start_tag.start..run.start_tag.end]);
    defer a.free(opening);
    const writer = @import("xml_source_writer.zig");
    const base = run.start_tag.start;
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    try changes.append(a, .{ .start = 0, .end = run.start_tag.end - base, .text = "", .start_tag = opening });
    if (owned_fields) |owned| if (keep_metadata and run.end_tag != null) {
        try @import("field_style_control_changes.zig").append(a, tree, span.run_element, &.{.{ .start = run.start_tag.end, .end = run.end_tag.?.start }}, owned, fields, continuation, &changes, &tags, limit);
    };
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, one: writer.Change, two: writer.Change) bool {
            return one.start < two.start;
        }
    }.less);
    const adjusted = try writer.write(a, tree.sourceOf(span.run_element), changes.items, limit);
    defer a.free(adjusted);
    if (site.empty_element) {
        if (start == end) return a.dupe(u8, adjusted);
        return writer.write(a, adjusted, &.{.{ .start = 0, .end = opening.len, .text = site.text[start..end], .expand_empty_element = true, .run_opening = .{ .start = 0, .end = opening.len } }}, limit);
    }
    const ending = run.end_tag orelse return error.SourceBindingMismatch;
    const suffix = adjusted.len - opening.len - (run.end - ending.start);
    if ((derived or metadata_only) and start == end) {
        if (keep_metadata) return a.dupe(u8, adjusted);
        return writer.write(a, adjusted, &.{.{ .start = opening.len, .end = opening.len + suffix, .text = "", .serialized_xml = "" }}, limit);
    }
    const insertion = opening.len + (if (derived and keep_metadata) suffix else @as(usize, 0));
    return writer.write(a, adjusted, &.{.{ .start = insertion, .end = if (keep_metadata) insertion else opening.len + suffix, .text = site.text[start..end], .run_opening = .{ .start = 0, .end = opening.len } }}, limit);
}
