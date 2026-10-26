//! Narrow immutable restart binding, borrowed only for the source Tree lifetime.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;
const Link = @import("../body/control_links.zig").Link;
const rules = @import("../body/control_rules.zig");

pub fn find(links: []const Link, source: usize) ?usize {
    for (links, 0..) |link, index| if (link.paragraph_node == source and link.header_id == rules.id("nwno")) return index;
    return null;
}

pub fn forParagraph(links: []const Link, p: @import("../../model/document.zig").Paragraph) !?usize {
    if (p.restart_control_source) |control| {
        for (links, 0..) |link, index| if (link.control_node == control) return index;
        return error.SourceBindingMismatch;
    }
    return find(links, p.source_node orelse p.header_template orelse return error.MissingParagraphTemplate);
}

pub fn forFamily(links: []const Link, origin: u32, paragraphs: []const @import("../../model/document.zig").Paragraph) !?usize {
    var selected = find(links, origin);
    for (paragraphs) |p| {
        if ((p.source_node orelse p.header_template orelse continue) != origin or p.restart_control_source == null) continue;
        const index = (try forParagraph(links, p)).?;
        if (selected != null and selected.? != index) return error.AmbiguousRestartSplit;
        selected = index;
    }
    return selected;
}

pub fn token(tree: Tree, links: []const Link, index: usize) ![]const u8 {
    if (index >= links.len) return error.InvalidControlLinkIndex;
    const link = links[index];
    if (link.code != 21 or link.id != rules.id("nwno") or link.header_id != link.id or link.identity != .exact) return error.UnsupportedRestartSplit;
    for (links, 0..) |other, i| if (i != index and other.paragraph_node == link.paragraph_node) return error.UnsupportedRestartSplit;
    const control = tree.nodes[link.control_node];
    if (control.parent != link.paragraph_node or control.subtree_end != link.control_node + 1) return error.UnsupportedRestartSplit;
    const restart = try @import("../body/number_control.zig").Restart.parse(control.record.value.control_header.properties);
    if (restart.header.attributes != 0 or restart.header.number == 0 or restart.extra.len != 0) return error.UnsupportedRestartSplit;
    const header = tree.nodes[link.paragraph_node].record.value.header;
    if (header.extra.len != 0 or (header.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
    var child = link.paragraph_node + 1;
    while (child < tree.nodes[link.paragraph_node].subtree_end) : (child += 1) {
        const entry = tree.nodes[child];
        if (entry.parent != link.paragraph_node or entry.subtree_end != child + 1) return error.UnsupportedRestartSplit;
        switch (entry.record.framing.tag) {
            67, 68, 69 => {},
            70 => if (entry.record.framing.payload.len != 0) return error.UnsupportedRangeSemantics,
            71 => if (child != link.control_node) return error.UnsupportedRestartSplit,
            else => return error.UnsupportedRestartSplit,
        }
    }
    const source = tree.nodes[link.text_node].record.framing.payload;
    const start = std.math.mul(usize, link.start_unit, 2) catch return error.LimitExceeded;
    if (start > source.len or source.len - start < 16) return error.SourceBindingMismatch;
    return source[start..][0..16];
}
