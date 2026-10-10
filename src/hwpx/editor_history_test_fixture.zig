const std = @import("std");
const editor = @import("editor_session.zig");

// Test-only XML session; not a ZIP opening or serialization oracle.
pub fn open(a: std.mem.Allocator, xml: []const u8, last_paragraph: usize) !editor.Session {
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    errdefer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{ .materialize_anchor_boundaries = true });
    errdefer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    errdefer a.free(locations);
    const sections = try a.alloc(editor.Section, 1);
    errdefer a.free(sections);
    const source = try a.dupe(u8, xml);
    sections[0] = .{ .tree = tree, .sites = sites, .locations = locations, .entry_index = 0, .first_paragraph = 1, .last_paragraph = last_paragraph };
    return .{ .allocator = a, .source = source, .sections = sections, .options = .{} };
}
