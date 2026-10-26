//! Owned temporary source-site projection; borrows original trees and edit intent.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const View = struct {
    session: editor.Session,
    sites: @import("text_sites.zig").Sites,
    locations: []@import("section_text.zig").Location,
    sections: []editor.Section,
    pub fn deinit(self: *View) void {
        const a = self.session.allocator;
        self.sites.deinit(a);
        a.free(self.locations);
        a.free(self.sections);
        self.* = undefined;
    }
};

pub fn open(a: std.mem.Allocator, session: *const editor.Session, section: usize) !View {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const selected = &session.sections[section];
    const values = if (selected.structure_values) |*current| current else return error.MissingStructuralSourceView;
    if (selected.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    var sites = try @import("paragraph_structure_projection.zig").collect(a, &selected.tree, values, editor.siteOptions(session.options));
    errdefer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &selected.tree, &sites, editor.siteOptions(session.options));
    errdefer a.free(locations);
    const sections = try a.dupe(editor.Section, session.sections);
    errdefer a.free(sections);
    const flat = &sections[section];
    flat.structure_values = null;
    flat.sites = sites;
    flat.locations = locations;
    flat.first_paragraph = selected.source_first_paragraph orelse selected.first_paragraph;
    flat.source_first_paragraph = null;
    for (locations) |location| flat.last_paragraph = @max(flat.last_paragraph, location.paragraph_ordinal);
    var proxy = session.*;
    proxy.allocator = a;
    proxy.sections = sections;
    return .{ .session = proxy, .sites = sites, .locations = locations, .sections = sections };
}

test "structural source view every allocation failure preserves borrowed topology and saved bytes" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='7'><p:run><p:t>AB</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session) !void {
            var view = try open(allocator, original, 0);
            defer view.deinit();
            try std.testing.expect(view.session.sections[0].structure_values == null);
            try std.testing.expectEqual(view.sites.items.ptr, view.session.sections[0].sites.items.ptr);
            try std.testing.expect(original.sections[0].structure_values != null);
            try std.testing.expectEqual(@as(usize, 0), original.sections[0].sites.items.len);
            try std.testing.expectEqual(@as(usize, 4), original.sections[0].structure_values.?.paragraphs.len);
        }
    }.run, .{&session});
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
