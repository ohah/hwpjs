//! Read-only exact restart merge provenance, separate from content ownership.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
pub const Plan = struct { control_node: u32, source_paragraph: usize, left_records: usize, right_records: usize, reference: ?u32 };

pub fn read(a: std.mem.Allocator, tree: Tree, paragraphs: []const model.Paragraph, paragraph: usize) !?Plan {
    if (paragraph >= paragraphs.len or paragraphs.len - paragraph < 2) return error.InvalidParagraph;
    const left = paragraphs[paragraph];
    const right = paragraphs[paragraph + 1];
    const origin = left.source_node orelse left.header_template orelse return error.MissingParagraphTemplate;
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var selected: ?usize = null;
    var first: ?u32 = null;
    var second: ?u32 = null;
    if (right.source_node == null and right.header_template == origin) {
        selected = try @import("page_restart_source.zig").forFamily(links.items, origin, paragraphs);
        if (selected) |index| {
            _ = try @import("current_restart_anchor.zig").resolve(a, tree, links.items, index, paragraphs);
            first = try @import("page_restart_current.zig").inFamily(a, tree, links.items, index, left, origin);
            second = try @import("page_restart_current.zig").inFamily(a, tree, links.items, index, right, origin);
        }
    } else if (left.source_node != null and right.source_node != null) {
        const one = try @import("page_restart_source.zig").forParagraph(links.items, left);
        const two = try @import("page_restart_source.zig").forParagraph(links.items, right);
        if (one != null and two != null) return error.UnsupportedStructuralControl;
        selected = one orelse two;
        if (one) |index| first = try @import("page_restart_current.zig").beforeSplit(a, tree, links.items, index, left);
        if (two) |index| second = try @import("page_restart_current.zig").beforeSplit(a, tree, links.items, index, right);
        if (selected != null and first == null and second == null) return error.MissingCurrentControlAnchor;
    }
    const index = selected orelse return null;
    const link = links.items[index];
    return .{ .control_node = @intCast(link.control_node), .source_paragraph = link.paragraph_node, .left_records = if (first != null) 1 else 0, .right_records = if (second != null) 1 else 0, .reference = if (link.paragraph_node != origin and (first != null or second != null)) @intCast(link.control_node) else null };
}
