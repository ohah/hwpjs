//! Validate formula-bearing edits in a temporary owned Sites transaction.
const std = @import("std");
const sites_mod = @import("text_sites.zig");

pub fn splice(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var draft = try clone(a, current);
    return finish(a, trees, section, current, &draft, locations, paragraph, start, deleted, inserted, max_bytes);
}

fn clone(a: std.mem.Allocator, current: *const sites_mod.Sites) !sites_mod.Sites {
    const items = try a.alloc(sites_mod.Site, current.items.len);
    var initialized: usize = 0;
    errdefer {
        for (items[0..initialized]) |item| a.free(item.text);
        a.free(items);
    }
    for (current.items, items) |site, *copy| {
        copy.* = site;
        copy.text = try a.dupe(u8, site.text);
        initialized += 1;
    }
    return .{ .items = items };
}

fn finish(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *sites_mod.Sites, draft: *sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    defer draft.deinit(a);
    const changed = try @import("plain_paragraph_edit.zig").spliceWithTabs(a, &trees[section], draft, locations, paragraph, start, deleted, inserted, max_bytes, true);
    if (!changed) return false;
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section, draft, .{});
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    std.mem.swap(sites_mod.Sites, current, draft);
    return true;
}
