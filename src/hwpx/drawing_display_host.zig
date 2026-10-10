//! Shared source provenance/current protected-anchor ownership for drawing adapters.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const xml = @import("document_xml.zig");
const protected = @import("protected_display_host.zig");
pub const Policy = struct {
    local: []const u8,
    kind: @import("run_anchor.zig").Kind,
    invalid_node: anyerror,
    switch_host: anyerror,
    missing_paragraph: anyerror,
    unsupported_anchor: anyerror,
};
pub fn sourceTemplate(tree: *const Tree, node: usize, policy: Policy) !usize {
    if (node >= tree.elements.len or !tree.elements[node].is(xml.paragraph_uri, policy.local)) return policy.invalid_node;
    var child = node;
    var template: ?usize = null;
    while (tree.elements[child].parent) |parent| {
        if (parent >= child) return error.InvalidPartTree;
        if (tree.elements[parent].is(xml.paragraph_uri, "switch")) return policy.switch_host;
        if (template == null and tree.elements[parent].is(xml.paragraph_uri, "p")) template = parent;
        child = parent;
    }
    return template orelse policy.missing_paragraph;
}
pub fn sourceAnchor(tree: *const Tree, node: usize, policy: Policy) !usize {
    _ = try sourceTemplate(tree, node, policy);
    var candidate = node;
    while (true) {
        const kind = @import("run_anchor.zig").kind(tree, candidate);
        if ((candidate == node and kind == policy.kind) or (candidate != node and kind == .container)) return candidate;
        const parent = tree.elements[candidate].parent orelse return policy.unsupported_anchor;
        if (!tree.elements[parent].is(xml.paragraph_uri, "container")) return policy.unsupported_anchor;
        candidate = parent;
    }
}
pub fn currentOrdinal(tree: *const Tree, paragraphs: []const Paragraph, first: usize, node: usize, policy: Policy) !usize {
    const template = try sourceTemplate(tree, node, policy);
    for (paragraphs) |paragraph| {
        if (paragraph.protected_positions != null and try @import("paragraph_display_host.zig").matchesTemplate(&paragraph, template))
            return protected.currentOrdinal(paragraphs, first, template, try sourceAnchor(tree, node, policy));
    }
    return @import("paragraph_display_host.zig").currentOrdinal(paragraphs, first, template);
}
pub fn anchorUnit(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, node: usize, policy: Policy) !usize {
    if (!try @import("paragraph_display_host.zig").matchesTemplate(paragraph, try sourceTemplate(tree, node, policy))) return error.SourceBindingMismatch;
    return protected.anchorPosition(a, tree, paragraph, try sourceAnchor(tree, node, policy));
}
