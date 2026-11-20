//! Creation fragment placement on the existing anchored text position SSOT.
//! The common writer owns source digest, physical owner, fields and cache checks.
//! Only a text event or an explicit zero-width insertion boundary is changed;
//! existing controls/anchors and their payloads are never rewritten or removed.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const sites_mod = @import("text_sites.zig");
const positions = @import("paragraph_text_positions.zig");
const writer = @import("xml_source_writer.zig");
const uri = @import("document_xml.zig").paragraph_uri;

fn textTag(a: std.mem.Allocator, tree: *const Tree, node: usize) !struct { opening: []u8, closing: []u8 } {
    if (!tree.elements[node].is(uri, "t")) return error.UnsupportedInlineObjectOwner;
    // Preserve the existing conservative attribute/comment boundary. XML CDATA
    // is a typed text event whose complete raw span is owned by text_sites.
    const raw_text = tree.sourceOf(node);
    if (std.mem.indexOf(u8, raw_text, "<!--") != null or std.mem.indexOf(u8, raw_text, "<?") != null) return error.UnsupportedInlineObjectTextSegments;
    var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, node);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try @import("../xml/namespaces.zig").isDeclaration(attribute.name)) continue;
        if (!std.mem.eql(u8, attribute.name.raw, "xml:space")) return error.UnsupportedInlineObjectTextAttributes;
    }
    const element = tree.elements[node];
    const raw = tree.source[element.start_tag.start..element.start_tag.end];
    const opening = if (element.end_tag == null) try std.fmt.allocPrint(a, "{s}>", .{raw[0 .. raw.len - 2]}) else try a.dupe(u8, raw);
    errdefer a.free(opening);
    return .{ .opening = opening, .closing = try std.fmt.allocPrint(a, "</{s}>", .{tag.name.raw}) };
}

pub const Guard = struct {
    context: *anyopaque,
    check: *const fn (*anyopaque, usize, usize, usize) anyerror!void,
};
pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, unit: u32, witness: []const u8, fragment: []const u8, limit: usize) ![]u8 {
    return writeChecked(a, tree, paragraph, unit, witness, fragment, limit, null);
}
pub fn writeChecked(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, unit: u32, witness: []const u8, fragment: []const u8, limit: usize, guard: ?Guard) ![]u8 {
    const options: sites_mod.Options = .{ .materialize_tab_boundaries = true, .materialize_anchor_boundaries = true, .max_text_bytes = @import("../image/image_insertion.zig").max_text_bytes };
    var sites = try sites_mod.collect(a, tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, tree, &sites, options);
    defer a.free(locations);
    const owners = try a.alloc(?usize, tree.elements.len);
    defer a.free(owners);
    for (tree.elements, 0..) |element, node| {
        if (element.parent) |parent| if (parent >= node) return error.SourceBindingMismatch;
        owners[node] = if (element.is(uri, "p")) node else if (element.parent) |parent| owners[parent] else null;
    }
    var ordinal: ?usize = null;
    for (sites.items, locations) |site, location| {
        if (site.element_index >= owners.len) return error.SourceBindingMismatch;
        if (owners[site.element_index] != paragraph) continue;
        if (ordinal != null and ordinal.? != location.paragraph_ordinal) return error.SourceBindingMismatch;
        ordinal = location.paragraph_ordinal;
    }
    const segments = try @import("anchor_paragraph_edit.zig").segments(a, tree, &sites, locations, ordinal orelse return error.MissingTextSite);
    defer a.free(segments);
    try positions.validateBoundary(&sites, segments, unit);
    var actual: std.ArrayList(u8) = .empty;
    defer actual.deinit(a);
    var selected: ?positions.Segment = null;
    var boundary: ?positions.Segment = null;
    for (segments) |segment| {
        if (segment.kind == .anchor and @import("run_anchor.zig").kind(tree, segment.index) == .unknown_object) return error.UnsupportedInlineObjectOwner;
        const text = positions.segmentText(&sites, segment);
        if (text.len > options.max_text_bytes -| actual.items.len) return error.LimitExceeded;
        try actual.appendSlice(a, text);
        if (selected == null and segment.kind == .text and unit >= segment.start_unit and unit <= segment.end_unit) selected = segment;
        if (boundary == null and segment.kind != .text and (unit == segment.start_unit or unit == segment.end_unit)) boundary = segment;
    }
    if (!std.mem.eql(u8, actual.items, witness)) return error.InlineObjectTextMismatch;
    var start: usize = undefined;
    var end: usize = undefined;
    var replacement: []u8 = undefined;
    var actual_node: usize = undefined;
    if (selected) |segment| {
        const site = sites.items[segment.index];
        actual_node = site.element_index;
        start = site.start;
        end = site.end;
        if (site.missing_text) {
            const run = tree.elements[site.element_index];
            if (!run.is(uri, "run") or run.parent != paragraph) return error.SourceBindingMismatch;
            if (site.empty_element) {
                const raw = tree.source[run.start_tag.start..run.start_tag.end];
                var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, site.element_index);
                defer tag.deinit(a);
                replacement = try std.fmt.allocPrint(a, "{s}>{s}</{s}>", .{ raw[0 .. raw.len - 2], fragment, tag.name.raw });
            } else {
                // A metadata-only run has no text unit. Insert after retained
                // section metadata; anchor-boundary sites keep their exact side.
                if (!site.anchor_boundary) start = (run.end_tag orelse return error.SourceBindingMismatch).start;
                end = start;
                replacement = try a.dupe(u8, fragment);
            }
        } else {
            const tag = try textTag(a, tree, site.element_index);
            defer {
                a.free(tag.opening);
                a.free(tag.closing);
            }
            const local = std.math.cast(u32, unit - segment.start_unit) orelse return error.LimitExceeded;
            const byte = try @import("text_site_edit.zig").bytePosition(site.text, local);
            const left = try @import("../xml/text_writer.zig").encode(a, site.text[0..byte], limit);
            defer a.free(left);
            const right = try @import("../xml/text_writer.zig").encode(a, site.text[byte..], limit);
            defer a.free(right);
            // A regular event span includes the entire CDATA wrapper when any;
            // it never includes adjacent inline units or another text event.
            replacement = if (site.empty_element)
                try std.fmt.allocPrint(a, "{s}{s}{s}{s}{s}{s}{s}", .{ tag.opening, left, tag.closing, fragment, tag.opening, right, tag.closing })
            else
                try std.fmt.allocPrint(a, "{s}{s}{s}{s}{s}", .{ left, tag.closing, fragment, tag.opening, right });
        }
    } else if (boundary) |segment| {
        actual_node = segment.index;
        const element = tree.elements[segment.index];
        start = if (unit == segment.start_unit) element.start_tag.start else element.end;
        end = start;
        if (segment.kind == .anchor) {
            replacement = try a.dupe(u8, fragment);
        } else {
            try positions.validateInlineUnit(tree, segment);
            const owner = element.parent orelse return error.SourceBindingMismatch;
            const tag = try textTag(a, tree, owner);
            defer {
                a.free(tag.opening);
                a.free(tag.closing);
            }
            replacement = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ tag.closing, fragment, tag.opening });
        }
    } else return error.UnsupportedInlineObjectOwner;
    defer a.free(replacement);
    if (guard) |g| try g.check(g.context, actual_node, start, end);
    var changes: [2]writer.Change = undefined;
    changes[0] = .{ .start = start, .end = end, .text = "", .serialized_xml = replacement };
    var count: usize = 1;
    var child = tree.elements[paragraph].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(uri, "linesegarray")) continue;
        // The common physical cache validator has already rejected duplicates,
        // unknown attributes and unsafe arrays before this serializer is called.
        if (count != 1) return error.UnsupportedSourceLineCache;
        changes[1] = .{ .start = tree.elements[node].start_tag.start, .end = tree.elements[node].end, .text = "", .serialized_xml = "" };
        count = 2;
    }
    if (count == 2 and changes[1].start < changes[0].start) std.mem.swap(writer.Change, &changes[0], &changes[1]);
    return writer.write(a, tree.source, changes[0..count], limit);
}
