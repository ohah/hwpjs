//! One temporary formula-aware paragraph projection for coordinates and display.
const std = @import("std");
const editor = @import("editor_session.zig");
const Sites = @import("text_sites.zig").Sites;
pub const View = struct {
    allocator: std.mem.Allocator,
    current: @import("formula_current_snapshot.zig").Snapshot,
    descriptors: []@import("text_sites.zig").Site,
    segments: []@import("paragraph_text_positions.zig").Segment = &.{},
    pub fn sites(self: *const View) Sites {
        return .{ .items = self.descriptors };
    }
    pub fn deinit(self: *View) void {
        self.allocator.free(self.segments);
        self.allocator.free(self.descriptors);
        self.current.deinit(self.allocator);
        self.* = undefined;
    }
};

pub fn prepare(session: *const editor.Session, section_index: usize, paragraph: usize) !?View {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = session.allocator;
    if (section.structure_values != null or section.created_tables.entries.items.len != 0) return null;
    if (!try @import("formula_source_query.zig").hasFormula(a, &section.tree)) return null;
    var view = block: {
        var current = try @import("formula_current_snapshot.zig").readFlat(a, session, section_index);
        errdefer current.deinit(a);
        const descriptors = try a.dupe(@import("text_sites.zig").Site, section.sites.items);
        break :block View{ .allocator = a, .current = current, .descriptors = descriptors };
    };
    var transferred = false;
    defer if (!transferred) view.deinit();
    for (view.current.prepared) |field| for (field.result.items) |replacement| {
        if (replacement.site_index >= view.descriptors.len) return error.InvalidTextSites;
        view.descriptors[replacement.site_index].text = replacement.text;
    };
    const sites = view.sites();
    const source_paragraph = try section.sourceParagraph(paragraph);
    @import("plain_paragraph_policy.zig").validateForFieldText(&section.tree, &sites, section.locations, source_paragraph) catch |err| switch (err) {
        error.UnsupportedParagraphControl, error.UnsupportedInlineControl => return null,
        else => return err,
    };
    view.segments = try @import("anchor_text_positions.zig").build(a, &section.tree, &sites, section.locations, source_paragraph);
    transferred = true;
    return view;
}

pub fn readText(session: *const editor.Session, section: usize, paragraph: usize) ![]u8 {
    var view = (try prepare(session, section, paragraph)) orelse return error.UnsupportedFormulaResultParagraph;
    defer view.deinit();
    const sites = view.sites();
    const a = session.allocator;
    var text: std.ArrayList(u8) = .empty;
    errdefer text.deinit(a);
    for (view.segments) |segment| {
        const value = @import("paragraph_text_positions.zig").segmentText(&sites, segment);
        if (value.len > session.options.max_text_bytes -| text.items.len) return error.LimitExceeded;
        try text.appendSlice(a, value);
    }
    return text.toOwnedSlice(a);
}
