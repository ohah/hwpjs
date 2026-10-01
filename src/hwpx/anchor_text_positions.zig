//! Opt-in current text/tab positions interleaved with protected object anchors.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const positions = @import("paragraph_text_positions.zig");
const anchors = @import("run_anchor.zig");
const uri = @import("document_xml.zig").paragraph_uri;

/// Same indices as text/tab segments; anchor.index is a source element index.
/// Caller owns output. This projection alone does not authorize editing.
pub fn build(a: std.mem.Allocator, tree: *const trees.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) ![]positions.Segment {
    const base = try positions.build(a, tree, sites, locations, paragraph);
    defer a.free(base);
    var owner: ?usize = null;
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal != paragraph) continue;
        var ancestor: ?usize = site.element_index;
        while (ancestor) |index| {
            if (tree.elements[index].is(uri, "p")) {
                if (owner) |previous| {
                    if (previous != index) return error.SourceBindingMismatch;
                } else owner = index;
                break;
            }
            ancestor = tree.elements[index].parent;
        }
        if (ancestor == null) return error.SourceBindingMismatch;
        const element = tree.elements[site.element_index];
        const run_index = if (element.is(uri, "run") and site.missing_text) site.element_index else element.parent orelse return error.SourceBindingMismatch;
        const run = tree.elements[run_index];
        if (!run.is(uri, "run") or run.parent != owner.?) return error.SourceBindingMismatch;
    }
    const paragraph_index = owner orelse return error.MissingTextSite;
    var output: std.ArrayList(positions.Segment) = .empty;
    defer output.deinit(a);
    try output.appendSlice(a, base);
    var run_index = tree.elements[paragraph_index].first_child;
    while (run_index) |index| {
        const run = tree.elements[index];
        if (run.is(uri, "run")) {
            var child_index = run.first_child;
            while (child_index) |child| {
                if (anchors.kind(tree, child) != null) try output.append(a, .{
                    .kind = .anchor,
                    .index = child,
                    .source_start = tree.elements[child].start_tag.start,
                    .end_unit = 1,
                });
                child_index = tree.elements[child].next_sibling;
            }
        }
        run_index = run.next_sibling;
    }
    std.mem.sort(positions.Segment, output.items, {}, struct {
        fn less(_: void, left: positions.Segment, right: positions.Segment) bool {
            if (left.source_start == right.source_start) return left.kind == .text and right.kind != .text;
            return left.source_start < right.source_start;
        }
    }.less);
    var cursor: usize = 0;
    for (output.items) |*segment| {
        const length = segment.end_unit - segment.start_unit;
        segment.start_unit = cursor;
        cursor = std.math.add(usize, cursor, length) catch return error.LimitExceeded;
        segment.end_unit = cursor;
    }
    return output.toOwnedSlice(a);
}
