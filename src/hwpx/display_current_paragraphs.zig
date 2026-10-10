//! One temporary view of authoritative paragraph order for display queries.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");
pub const View = struct {
    paragraphs: []const model.Paragraph,
    owned: ?model.Values = null,
    pub fn deinit(self: *View, a: std.mem.Allocator) void {
        if (self.owned) |*values| values.deinit(a);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, section: *const editor.Section, options: editor.Options) !View {
    if (section.structure_values) |*values| {
        if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        if (values.paragraphs.len > 100000) return error.LimitExceeded;
        return .{ .paragraphs = values.paragraphs };
    }
    const first = section.source_first_paragraph orelse section.first_paragraph;
    if (first == 0) return error.SourceBindingMismatch;
    var report: @import("section_text.zig").Report = .{ .paragraphs = first - 1 };
    var owned = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(options), &report);
    errdefer owned.deinit(a);
    if (owned.paragraphs.len > 100000) return error.LimitExceeded;
    return .{ .paragraphs = owned.paragraphs, .owned = owned };
}
