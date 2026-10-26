//! Source equation identity mapped to current protected paragraph coordinates.
const std = @import("std");
const editor = @import("editor_session.zig");
const sources = @import("equation_script_sources.zig");
const host = @import("protected_display_host.zig");

pub const Site = struct {
    source: sources.Site,
    paragraph: ?usize = null,
    anchor_unit: ?usize = null,
    error_name: ?[]const u8 = null,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize) ![]Site {
    const original = try sources.read(a, session, section);
    defer a.free(original);
    if (original.len == 0) return a.alloc(Site, 0);
    const part = &session.sections[section];
    var current = try @import("display_current_paragraphs.zig").read(a, part, session.options);
    defer current.deinit(a);
    const rows = try a.alloc(Site, original.len);
    errdefer a.free(rows);
    for (original, rows) |source, *row| {
        row.* = .{ .source = source };
        // Keep unavailable source diagnostics without guessing a visible host.
        if (source.issue != null) continue;
        const run = part.tree.elements[source.node].parent orelse return error.InvalidPartTree;
        const template = part.tree.elements[run].parent orelse return error.InvalidPartTree;
        const paragraph = host.currentAnchorOrdinal(current.paragraphs, part.first_paragraph, template, source.node) catch |err| switch (err) {
            error.MissingCurrentParagraphDisplayHost, error.AmbiguousParagraphDisplayHost => {
                row.error_name = @errorName(err);
                continue;
            },
            else => return err,
        };
        row.paragraph = paragraph;
        row.anchor_unit = host.anchorPosition(a, &part.tree, &current.paragraphs[paragraph - part.first_paragraph], source.node) catch |err| switch (err) {
            error.MissingProtectedDisplayAnchor, error.UnsupportedJoinedParagraphLocations, error.UnsupportedInlineControl, error.UnsupportedTextPositionProjection, error.MissingTextSite => {
                row.error_name = @errorName(err);
                continue;
            },
            else => return err,
        };
    }
    return rows;
}
