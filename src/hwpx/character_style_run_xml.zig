//! Assemble an entire current text-only run from its owned style partition.
const std = @import("std");
const Span = @import("character_style_paint.zig").Span;
pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const Span, limit: usize) ![]u8 {
    return writePolicy(a, tree, sites, spans, limit, null, &.{}, false);
}

pub fn writeFields(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const Span, owned: []const @import("field_position.zig").Position, limit: usize) ![]u8 {
    return writePolicy(a, tree, sites, spans, limit, owned, &.{}, false);
}

pub fn writeFieldsDirty(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const Span, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize) ![]u8 {
    return writePolicy(a, tree, sites, spans, limit, owned, fields, false);
}

pub fn writeFieldsCurrent(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const Span, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool, limit: usize) ![]u8 {
    return writePolicy(a, tree, sites, spans, limit, owned, fields, continuation);
}

fn writePolicy(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, spans: []const Span, limit: usize, owned_fields: ?[]const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool) ![]u8 {
    if (spans.len == 0) return error.InvalidTextSites;
    const first = spans[0];
    if (first.site_index >= sites.items.len or first.start_unit != first.site_start_unit) return error.InvalidTextSites;
    var cursor = first.start_unit;
    var site_count: usize = 0;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (spans, 0..) |span, index| {
        if (span.run_element != first.run_element or span.site_index >= sites.items.len) return error.SourceBindingMismatch;
        const starts_site = index == 0 or spans[index - 1].site_index != span.site_index;
        if (starts_site) {
            if (span.site_index != first.site_index + site_count or span.start_unit != span.site_start_unit) return error.InvalidTextSites;
            site_count += 1;
        } else if (spans[index - 1].site_start_unit != span.site_start_unit) return error.SourceBindingMismatch;
        if (span.start_unit != cursor or span.end_unit < cursor) return error.InvalidTextSites;
        const ends_site = index + 1 == spans.len or spans[index + 1].site_index != span.site_index;
        if (span.start_unit == span.end_unit and (!starts_site or !ends_site)) return error.InvalidTextSites;
        if (ends_site) {
            const byte_end = try @import("text_site_edit.zig").bytePosition(sites.items[span.site_index].text, std.math.cast(u32, span.end_unit - span.site_start_unit) orelse return error.LimitExceeded);
            if (byte_end != sites.items[span.site_index].text.len) return error.InvalidTextSites;
        }
        // An unmaterialized boundary owns no source XML to format or emit.
        // Keep its position/site validation above; do not discard edited text.
        if (sites.items[span.site_index].anchor_boundary and sites.items[span.site_index].text.len == 0) {
            cursor = span.end_unit;
            continue;
        }
        const part = if (owned_fields) |owned|
            try @import("character_style_run_fragment.zig").writeFieldsCurrent(a, tree, sites, span, limit - output.items.len, starts_site, index + 1 == spans.len, owned, fields, continuation)
        else
            try @import("character_style_run_fragment.zig").writeMode(a, tree, sites, span, limit - output.items.len, starts_site, index + 1 == spans.len);
        defer a.free(part);
        if (part.len > limit - output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, part);
        cursor = span.end_unit;
    }
    // Never silently discard another source text site in the same run.
    var bound_sites: usize = 0;
    for (sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const element = tree.elements[site.element_index];
        if ((site.missing_text and site.element_index == first.run_element) or (!site.missing_text and element.parent == first.run_element)) bound_sites += 1;
    }
    if (bound_sites != site_count) return error.SourceBindingMismatch;
    return output.toOwnedSlice(a);
}
