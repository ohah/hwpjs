//! Connector eligibility stays distinct from ordinary line geometry.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const common = @import("drawing_display_host.zig");
const policy: common.Policy = .{ .local = "connectLine", .kind = .connector_line, .invalid_node = error.InvalidConnectorGeometryNode, .switch_host = error.UnsupportedConnectorSwitchHost, .missing_paragraph = error.MissingConnectorDisplayParagraph, .unsupported_anchor = error.UnsupportedConnectorAnchor };
pub fn sourceTemplate(tree: *const Tree, node: usize) !usize {
    return common.sourceTemplate(tree, node, policy);
}
pub fn sourceAnchor(tree: *const Tree, node: usize) !usize {
    return common.sourceAnchor(tree, node, policy);
}
pub fn currentOrdinal(tree: *const Tree, paragraphs: []const Paragraph, first: usize, node: usize) !usize {
    return common.currentOrdinal(tree, paragraphs, first, node, policy);
}
pub fn anchorUnit(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, node: usize) !usize {
    return common.anchorUnit(a, tree, paragraph, node, policy);
}
