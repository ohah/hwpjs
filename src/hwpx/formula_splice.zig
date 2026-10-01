//! Validate formula-bearing edits in a temporary owned Sites transaction.
const std = @import("std");
const sites_mod = @import("text_sites.zig");

pub fn splice(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    return spliceMode(a, trees, section, current, locations, paragraph, start, deleted, inserted, max_bytes, false);
}

pub fn spliceMode(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, anchored: bool) !bool {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var draft = try current.clone(a);
    return finish(a, trees, section, current, &draft, locations, paragraph, start, deleted, inserted, max_bytes, anchored);
}

fn finish(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, draft: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, anchored: bool) !bool {
    defer draft.deinit(a);
    const changed = if (anchored)
        try @import("anchor_paragraph_edit.zig").splice(a, &trees[section], draft, locations, paragraph, start, deleted, inserted, max_bytes)
    else
        try @import("plain_paragraph_edit.zig").spliceWithTabs(a, &trees[section], draft, locations, paragraph, start, deleted, inserted, max_bytes, true);
    if (!changed) return false;
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section, draft, .{});
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    std.mem.swap(sites_mod.Sites, current, draft);
    return true;
}
