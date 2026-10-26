//! Validate one current member against its immutable restart source.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Link = @import("../body/control_links.zig").Link;

pub fn unit(a: std.mem.Allocator, tree: Tree, links: []const Link, index: usize, p: model.Paragraph) !?u32 {
    return read(a, tree, links, index, p, false, null);
}

pub fn inFamily(a: std.mem.Allocator, tree: Tree, links: []const Link, index: usize, p: model.Paragraph, origin: u32) !?u32 {
    return read(a, tree, links, index, p, false, origin);
}

/// Original projections still count stale line/range records as deferred.
/// The split draft drops these caches and derives its new count from tokens.
pub fn beforeSplit(a: std.mem.Allocator, tree: Tree, links: []const Link, index: usize, p: model.Paragraph) !?u32 {
    return read(a, tree, links, index, p, p.source_node != null, null);
}

fn read(a: std.mem.Allocator, tree: Tree, links: []const Link, index: usize, p: model.Paragraph, source_caches: bool, family: ?u32) !?u32 {
    const source_token = try @import("page_restart_source.zig").token(tree, links, index);
    const link = links[index];
    const origin = p.source_node orelse p.header_template orelse return error.MissingParagraphTemplate;
    if (p.source_node != null and p.header_template != null) return error.SourceBindingMismatch;
    if (origin >= tree.nodes.len or tree.nodes[origin].record.value != .header) return error.SourceBindingMismatch;
    if (p.restart_control_source) |control| if (control != link.control_node) return error.SourceBindingMismatch;
    if (origin != link.paragraph_node) {
        if (p.restart_control_source == null and (family == null or family.? != origin)) return error.SourceBindingMismatch;
        var groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, tree.version orelse return error.MissingSourceVersion);
        defer groups.deinit(a);
        if (try @import("paragraph_owner.zig").logicalOwner(tree, groups, origin) != try @import("paragraph_owner.zig").logicalOwner(tree, groups, link.paragraph_node)) return error.ParagraphOwnerMismatch;
    }
    const parent: ?u32 = if (tree.nodes[link.paragraph_node].parent) |value| @intCast(value) else null;
    if (p.parent_node != parent or p.field_attributes != null or p.formula_results != null) return error.SourceBindingMismatch;
    if (p.source_node == null and p.instance_id == 0) return error.InvalidParagraphInstanceId;
    if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    const bytes = try @import("plain_text_content.zig").textBytes(a, p);
    defer a.free(bytes);
    try @import("token_ownership.zig").validate(p, bytes);
    try @import("control_boundaries.zig").validateRetainedText(bytes);
    try @import("control_boundaries.zig").validate(bytes, 0, 0);
    var found: ?u32 = null;
    for (p.tokens) |token| {
        if (token.kind != .control) continue;
        if (token.raw.len == 2 and (std.mem.readInt(u16, token.raw[0..2], .little) == 10 or std.mem.readInt(u16, token.raw[0..2], .little) == 13)) continue;
        if (!std.mem.eql(u8, token.raw, source_token)) return error.SourceBindingMismatch;
        if (found != null) return error.AmbiguousRestartSplit;
        found = token.start_unit;
    }
    const records: usize = if (found != null) 1 else 0;
    if (p.restart_control_source != null and found == null) return error.SourceBindingMismatch;
    if (p.deferred_direct_records != records) {
        if (!source_caches) return error.SourceBindingMismatch;
        var caches: usize = 0;
        for (tree.nodes[link.paragraph_node + 1 .. tree.nodes[link.paragraph_node].subtree_end]) |node| {
            if (node.record.framing.tag == 69 or node.record.framing.tag == 70) caches += 1;
        }
        if (p.deferred_direct_records != records + caches) return error.SourceBindingMismatch;
    }
    return found;
}
