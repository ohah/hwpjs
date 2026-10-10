//! Borrowed current position projection; original run IDs are provenance,
//! not an editable style cache or proof of resource resolution.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Segment = @import("paragraph_text_positions.zig").Segment;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Span = struct { start_unit: usize, end_unit: usize, site_index: usize, run_element: usize, source_char_shape_id: ?u32 };

pub fn runId(a: std.mem.Allocator, tree: *const Tree, run: usize) !?u32 {
    if (run >= tree.elements.len or !tree.elements[run].is(uri, "run")) return error.SourceBindingMismatch;
    const raw = try tree.attributeValue(a, run, "", "charPrIDRef");
    if (raw) |value| {
        const decoded = try value.toUtf8(a, 4096);
        defer a.free(decoded);
        return try @import("xml_values.zig").unsigned32(decoded);
    }
    return null;
}

pub fn build(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, segments: []const Segment, max_spans: usize) ![]Span {
    if (segments.len > max_spans) return error.LimitExceeded;
    const output = try a.alloc(Span, segments.len);
    errdefer a.free(output);
    var end: usize = 0;
    for (segments, output) |segment, *span| {
        if (segment.kind != .text) return error.UnsupportedInlineControl;
        if (segment.index >= sites.items.len or segment.start_unit != end or segment.end_unit < segment.start_unit) return error.InvalidTextSites;
        const site = sites.items[segment.index];
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const element = tree.elements[site.element_index];
        if (site.missing_text) {
            if (!element.is(uri, "run")) return error.SourceBindingMismatch;
        } else if (!element.is(uri, "t")) return error.SourceBindingMismatch;
        const run = if (site.missing_text) site.element_index else element.parent orelse return error.SourceBindingMismatch;
        if (run >= tree.elements.len or !tree.elements[run].is(uri, "run")) return error.SourceBindingMismatch;
        const id = try runId(a, tree, run);
        span.* = .{ .start_unit = segment.start_unit, .end_unit = segment.end_unit, .site_index = segment.index, .run_element = run, .source_char_shape_id = id };
        end = segment.end_unit;
    }
    return output;
}
