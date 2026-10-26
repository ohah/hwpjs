//! Resolve one restart through a current source/template family, without caches.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Link = @import("../body/control_links.zig").Link;
pub const Anchor = struct { paragraph: usize, unit: u32 };

pub fn resolve(a: std.mem.Allocator, tree: Tree, links: []const Link, index: usize, paragraphs: []const model.Paragraph) !Anchor {
    if (index >= links.len) return error.InvalidControlLinkIndex;
    const link = links[index];
    _ = try @import("page_restart_source.zig").token(tree, links, index);
    var family: u32 = @intCast(link.paragraph_node);
    var explicit = false;
    for (paragraphs) |p| if (p.restart_control_source == @as(u32, @intCast(link.control_node))) {
        const origin = p.source_node orelse p.header_template orelse return error.MissingParagraphTemplate;
        if (explicit) return error.AmbiguousRestartSplit;
        explicit = true;
        family = origin;
    };
    if (family >= tree.nodes.len or tree.nodes[family].record.value != .header) return error.SourceBindingMismatch;
    if (family != link.paragraph_node) for (paragraphs) |p| {
        if ((p.source_node orelse p.header_template orelse continue) == link.paragraph_node) return error.SourceBindingMismatch;
    };
    var anchor: ?Anchor = null;
    var original_seen = false;
    var previous: ?usize = null;
    for (paragraphs, 0..) |p, paragraph| {
        const origin = p.source_node orelse p.header_template orelse continue;
        if (origin != family) continue;
        if (p.source_node != null) {
            if (original_seen or p.header_template != null) return error.SourceBindingMismatch;
            if (p.instance_id != tree.nodes[family].record.value.header.instance_id) return error.SourceBindingMismatch;
            original_seen = true;
        } else {
            if (!original_seen or previous == null or previous.? + 1 != paragraph) return error.SourceBindingMismatch;
            if (p.instance_id == 0) return error.InvalidParagraphInstanceId;
            for (paragraphs[0..paragraph]) |prior| if (prior.instance_id == p.instance_id) return error.InvalidParagraphInstanceId;
        }
        previous = paragraph;
        if (try @import("page_restart_current.zig").inFamily(a, tree, links, index, p, family)) |position| {
            if (anchor != null) return error.AmbiguousRestartSplit;
            anchor = .{ .paragraph = paragraph, .unit = position };
        }
    }
    if (!original_seen) return error.MissingPageControlOwner;
    return anchor orelse error.MissingCurrentControlAnchor;
}
