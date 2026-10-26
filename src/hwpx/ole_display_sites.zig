//! Current protected OLE coordinates; source metadata and payload interpretation stay separate.
const std = @import("std");
const editor = @import("editor_session.zig");
const uri = @import("document_xml.zig").paragraph_uri;
const host = @import("protected_display_host.zig");
pub const Site = struct {
    ole_node: usize,
    paragraph: ?usize = null,
    anchor_unit: ?usize = null,
    error_name: ?[]const u8 = null,
    chart_wrapper: ?usize = null,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Site {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var output: std.ArrayList(Site) = .empty;
    defer output.deinit(a);
    for (section.tree.elements, 0..) |element, node| {
        if (!element.is(uri, "ole")) continue;
        if (output.items.len >= session.options.max_sites) return error.LimitExceeded;
        var site: Site = .{ .ole_node = node };
        var anchor = node;
        var run = element.parent orelse {
            site.error_name = "UnsupportedOleDisplayHost";
            try output.append(a, site);
            continue;
        };
        if (section.tree.elements[run].is(uri, "default")) {
            if (section.tree.elements[run].parent) |wrapper| {
                const pair = @import("chart_pair_target.zig").objects(&section.tree, wrapper) catch null;
                if (pair) |objects| if (objects.ole == node) {
                    site.chart_wrapper = wrapper;
                    anchor = wrapper;
                    run = section.tree.elements[wrapper].parent.?;
                };
            }
        }
        const template = section.tree.elements[run].parent;
        if (!section.tree.elements[run].is(uri, "run") or template == null or !section.tree.elements[template.?].is(uri, "p")) {
            site.error_name = "UnsupportedOleDisplayHost";
            try output.append(a, site);
            continue;
        }
        const ordinal = host.currentAnchorOrdinal(current.paragraphs, section.first_paragraph, template.?, anchor) catch |err| switch (err) {
            error.MissingCurrentParagraphDisplayHost, error.AmbiguousParagraphDisplayHost => {
                site.error_name = @errorName(err);
                try output.append(a, site);
                continue;
            },
            else => return err,
        };
        site.paragraph = ordinal;
        site.anchor_unit = host.anchorPosition(a, &section.tree, &current.paragraphs[ordinal - section.first_paragraph], anchor) catch |err| switch (err) {
            error.MissingProtectedDisplayAnchor, error.UnsupportedJoinedParagraphLocations, error.UnsupportedInlineControl, error.UnsupportedTextPositionProjection, error.MissingTextSite => {
                site.error_name = @errorName(err);
                try output.append(a, site);
                continue;
            },
            else => return err,
        };
        try output.append(a, site);
    }
    return output.toOwnedSlice(a);
}
