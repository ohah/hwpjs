//! Namespace-close a source run, then apply current style fragments in that scope.
const std = @import("std");
pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const @import("character_style_paint.zig").Span, limit: usize) ![]u8 {
    return writePolicy(a, tree, sites, spans, null, &.{}, false, limit);
}

pub fn writeFieldsCurrent(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const @import("character_style_paint.zig").Span, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool, limit: usize) ![]u8 {
    return writePolicy(a, tree, sites, spans, owned, fields, continuation, limit);
}

fn writePolicy(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const @import("character_style_paint.zig").Span, owned: ?[]const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool, limit: usize) ![]u8 {
    if (spans.len == 0 or spans[0].site_index >= sites.items.len) return error.InvalidTextSites;
    const closed = try @import("xml_subtree_closure.zig").write(a, tree, spans[0].run_element, limit);
    defer a.free(closed);
    const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", closed, "</p:p></s:sec>" });
    defer a.free(wrapper);
    var normalized = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{ .max_xml_bytes = wrapper.len });
    defer normalized.deinit(a);
    var original = try @import("text_sites.zig").collect(a, &normalized, .{});
    defer original.deinit(a);
    const first_site = spans[0].site_index;
    const source_first = sites.items[first_site];
    if (original.items.len == 0 and source_first.missing_text) {
        const source_run = tree.elements[spans[0].run_element];
        const owner = source_run.parent orelse return error.SourceBindingMismatch;
        if (!@import("continuation_empty_run.zig").valid(tree, owner, source_first)) return error.SourceBindingMismatch;
        const augmented = try @import("continuation_empty_run.zig").clone(a, &normalized, 1, &original);
        original.deinit(a);
        original = augmented;
    }
    if (original.items.len == 0 or original.items.len > sites.items.len - first_site) return error.SourceBindingMismatch;
    const rows = try a.dupe(@import("text_sites.zig").Site, original.items);
    defer a.free(rows);
    for (rows, 0..) |*row, index| {
        const source = sites.items[first_site + index];
        if (source.element_index >= tree.elements.len) return error.InvalidTextSites;
        const element = tree.elements[source.element_index];
        if (source.missing_text) {
            if (source.element_index != spans[0].run_element) return error.SourceBindingMismatch;
        } else if (element.parent != spans[0].run_element) return error.SourceBindingMismatch;
        row.text = source.text;
    }
    const base = spans[0].site_start_unit;
    const local = try a.dupe(@import("character_style_paint.zig").Span, spans);
    defer a.free(local);
    for (local) |*span| {
        if (span.site_index < first_site or span.site_index - first_site >= rows.len or span.run_element != spans[0].run_element or span.site_start_unit < base or span.start_unit < span.site_start_unit or span.end_unit < span.start_unit) return error.SourceBindingMismatch;
        span.start_unit -= base;
        span.end_unit -= base;
        span.site_start_unit -= base;
        span.site_index -= first_site;
        span.run_element = 2;
    }
    if (owned) |markers| {
        var mapped = try @import("field_run_marker_map.zig").build(a, tree, spans[0].run_element, &normalized, 2, markers, fields);
        defer mapped.deinit(a);
        return @import("character_style_run_xml.zig").writeFieldsCurrent(a, &normalized, &.{ .items = rows }, local, mapped.positions, mapped.dirty, continuation, limit);
    }
    return @import("character_style_run_xml.zig").write(a, &normalized, &.{ .items = rows }, local, limit);
}
