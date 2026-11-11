//! Current form anchors derived from authoritative paragraph/protected positions.
const std = @import("std");
const editor = @import("editor_session.zig");
const protected = @import("protected_display_host.zig");
pub const Site = struct {
    formNode: usize,
    kind: @import("run_anchor.zig").Kind,
    paragraph: ?usize = null,
    anchorUnit: ?usize = null,
    state: enum { located, conditional, missing_host, ambiguous_host, unsupported_anchor },
};
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Site {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const nodes = try @import("form_source_nodes.zig").read(a, &section.tree, @min(session.options.max_sites, 100000));
    defer a.free(nodes);
    if (nodes.len == 0) return a.alloc(Site, 0);
    const options = editor.siteOptions(session.options);
    const frames = try @import("xml_tree_selection.zig").build(a, &section.tree, options.branch_policy, options.max_attribute_bytes);
    defer a.free(frames);
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var rows: std.ArrayList(Site) = .empty;
    errdefer rows.deinit(a);
    for (nodes) |node| {
        if (!frames[node.formNode].active) {
            try rows.append(a, .{ .formNode = node.formNode, .kind = node.kind, .state = .conditional });
            continue;
        }
        const run = section.tree.elements[node.formNode].parent.?;
        const template = section.tree.elements[run].parent.?;
        const ordinal = protected.currentAnchorOrdinal(current.paragraphs, section.first_paragraph, template, node.formNode) catch |err| switch (err) {
            error.MissingCurrentParagraphDisplayHost => {
                try rows.append(a, .{ .formNode = node.formNode, .kind = node.kind, .state = .missing_host });
                continue;
            },
            error.AmbiguousParagraphDisplayHost => {
                try rows.append(a, .{ .formNode = node.formNode, .kind = node.kind, .state = .ambiguous_host });
                continue;
            },
            else => return err,
        };
        const unit = protected.anchorPosition(a, &section.tree, &current.paragraphs[ordinal - section.first_paragraph], node.formNode) catch |err| switch (err) {
            error.MissingProtectedDisplayAnchor, error.UnsupportedJoinedParagraphLocations, error.UnsupportedInlineControl, error.UnsupportedTextPositionProjection, error.MissingTextSite => {
                try rows.append(a, .{ .formNode = node.formNode, .kind = node.kind, .paragraph = ordinal, .state = .unsupported_anchor });
                continue;
            },
            else => return err,
        };
        try rows.append(a, .{ .formNode = node.formNode, .kind = node.kind, .paragraph = ordinal, .anchorUnit = unit, .state = .located });
    }
    return rows.toOwnedSlice(a);
}
