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
    var view = (try prepareSection(session, section_index)) orelse return null;
    var transferred = false;
    defer if (!transferred) view.deinit();
    if (!try selectParagraph(session, section_index, paragraph, &view)) return null;
    transferred = true;
    return view;
}

/// Owned request-local state. Never retain this view across a session mutation.
pub fn prepareSection(session: *const editor.Session, section_index: usize) !?View {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
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
    transferred = true;
    return view;
}

/// Reuse one current formula evaluation while replacing only paragraph segments.
pub fn selectParagraph(session: *const editor.Session, section_index: usize, paragraph: usize, view: *View) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = view.allocator;
    a.free(view.segments);
    view.segments = &.{};
    const sites = view.sites();
    const source_paragraph = try section.sourceParagraph(paragraph);
    @import("plain_paragraph_policy.zig").validateForFieldText(&section.tree, &sites, section.locations, source_paragraph) catch |err| switch (err) {
        error.UnsupportedParagraphControl, error.UnsupportedInlineControl => return false,
        else => return err,
    };
    view.segments = try @import("anchor_text_positions.zig").build(a, &section.tree, &sites, section.locations, source_paragraph);
    return true;
}

pub fn readText(session: *const editor.Session, section: usize, paragraph: usize) ![]u8 {
    var view = (try prepare(session, section, paragraph)) orelse return error.UnsupportedFormulaResultParagraph;
    defer view.deinit();
    return readPreparedText(&view, session.options.max_text_bytes);
}

pub fn readPreparedText(view: *const View, max_text_bytes: usize) ![]u8 {
    const sites = view.sites();
    const a = view.allocator;
    var text: std.ArrayList(u8) = .empty;
    errdefer text.deinit(a);
    for (view.segments) |segment| {
        const value = @import("paragraph_text_positions.zig").segmentText(&sites, segment);
        if (value.len > max_text_bytes -| text.items.len) return error.LimitExceeded;
        try text.appendSlice(a, value);
    }
    return text.toOwnedSlice(a);
}
