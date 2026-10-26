//! Request-local line geometry SSOT; does not grant paint permission.
//! Shared by single readGeometry and the request-local batch.
const std = @import("std");
const editor = @import("editor_session.zig");
const current = @import("display_current_paragraphs.zig");
const host = @import("line_display_host.zig");

/// Detached scalar projection. No borrowed view/tree/text survives the call.
pub const Values = struct {
    node: usize,
    paragraph: usize,
    anchor_node: usize,
    anchor_unit: usize,
    endpoints: @import("line_rendering_endpoints.zig").Endpoints,
};

/// The caller supplies one live authoritative view for this exact section.
/// Keep the single-reader evaluation/error order and matrix bound unchanged.
pub fn readWithView(a: std.mem.Allocator, section: *const editor.Section, view: *const current.View, node: usize) !Values {
    const paragraph = try host.currentOrdinal(&section.tree, view.paragraphs, section.first_paragraph, node);
    return .{
        .node = node,
        .paragraph = paragraph,
        .anchor_node = try host.sourceAnchor(&section.tree, node),
        .anchor_unit = try host.anchorUnit(a, &section.tree, &view.paragraphs[paragraph - section.first_paragraph], node),
        .endpoints = try @import("line_rendering_endpoints.zig").read(a, &section.tree, node, 1024),
    };
}
