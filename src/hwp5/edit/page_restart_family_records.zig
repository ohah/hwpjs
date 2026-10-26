//! Serialize a checked current restart family; section patches remain external.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Link = @import("../body/control_links.zig").Link;

pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), tree: Tree, links: []const Link, index: usize, origin: u32, paragraphs: []const model.Paragraph, last_in_owner: bool, char_count: usize, limit: usize) !void {
    if (out.items.len > limit) return error.LimitExceeded;
    const anchor = try @import("current_restart_anchor.zig").resolve(a, tree, links, index, paragraphs);
    if ((paragraphs[anchor.paragraph].source_node orelse paragraphs[anchor.paragraph].header_template) != origin) return error.SourceBindingMismatch;
    const link = links[index];
    const template = tree.nodes[origin].record.framing;
    const control = tree.nodes[link.control_node].record.framing;
    if (template.level == std.math.maxInt(u10) or control.level != template.level + 1) return error.SourceBindingMismatch;
    var last: ?usize = null;
    for (paragraphs, 0..) |p, paragraph| {
        if ((p.source_node orelse p.header_template orelse continue) == origin) last = paragraph;
    }
    var staged: std.ArrayList(u8) = .empty;
    defer staged.deinit(a);
    for (paragraphs, 0..) |p, paragraph| {
        if ((p.source_node orelse p.header_template orelse continue) != origin) continue;
        const text = try @import("plain_text_content.zig").textBytes(a, p);
        defer a.free(text);
        try @import("page_restart_split_records.zig").appendParagraph(a, &staged, template, control, p, text, p.source_node == null, paragraph == last and last_in_owner, paragraph == anchor.paragraph, char_count, limit - out.items.len);
    }
    try out.appendSlice(a, staged.items);
}
