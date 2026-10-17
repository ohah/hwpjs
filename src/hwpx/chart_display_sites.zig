//! Chart source identity mapped to current protected paragraph coordinates.
const std = @import("std");
pub const Site = struct { wrapper: usize, paragraph: ?usize = null, anchorUnit: ?usize = null, error_name: ?[]const u8 = null };
pub fn read(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section_index: usize) ![]Site {
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, session, section_index);
    defer a.free(nodes);
    if (nodes.len == 0) return a.alloc(Site, 0);
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const rows = try a.alloc(Site, nodes.len);
    errdefer a.free(rows);
    for (nodes, rows) |wrapper, *row| {
        row.* = .{ .wrapper = wrapper };
        const run = section.tree.elements[wrapper].parent.?;
        const template = section.tree.elements[run].parent.?;
        const ordinal = @import("protected_display_host.zig").currentAnchorOrdinal(current.paragraphs, section.first_paragraph, template, wrapper) catch |err| switch (err) {
            error.MissingCurrentParagraphDisplayHost, error.AmbiguousParagraphDisplayHost => {
                row.error_name = @errorName(err);
                continue;
            },
            else => return err,
        };
        row.paragraph = ordinal;
        row.anchorUnit = @import("protected_display_host.zig").anchorPosition(a, &section.tree, &current.paragraphs[ordinal - section.first_paragraph], wrapper) catch |err| switch (err) {
            error.MissingProtectedDisplayAnchor, error.UnsupportedJoinedParagraphLocations, error.UnsupportedInlineControl, error.UnsupportedTextPositionProjection, error.MissingTextSite => {
                row.error_name = @errorName(err);
                continue;
            },
            else => return err,
        };
    }
    return rows;
}
