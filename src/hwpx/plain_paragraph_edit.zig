//! Plain paragraph text across existing styled sites. Inline controls require
//! a separate position projection and are explicitly not flattened here.
const std = @import("std");
const sites_module = @import("text_sites.zig");
const tree_module = @import("xml_part_tree.zig");
const scanner = @import("section_text.zig");
const edit = @import("text_site_edit.zig");
const scalars = @import("../xml/scalars.zig");

pub fn splice(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *sites_module.Sites, locations: []const scanner.Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    if (locations.len != sites.items.len or paragraph == 0) return error.InvalidTextSites;
    try @import("plain_paragraph_policy.zig").validate(tree, sites, locations, paragraph);
    var total: usize = 0;
    var found = false;
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal != paragraph) continue;
        found = true;
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        if (tree.elements[site.element_index].first_child != null) return error.UnsupportedInlineControl;
        total = std.math.add(usize, total, try unitCount(site.text)) catch return error.LimitExceeded;
    }
    if (!found) return error.MissingTextSite;
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    if (end > total) return error.InvalidTextPosition;
    // Text equality is a semantic no-op across run boundaries too. Do not
    // redistribute unchanged text into the insertion run and lose styling.
    var current: std.ArrayList(u8) = .empty;
    defer current.deinit(a);
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal == paragraph) try current.appendSlice(a, site.text);
    }
    const start_byte = try edit.bytePosition(current.items, start);
    const end_byte = try edit.bytePosition(current.items, end);
    if (std.mem.eql(u8, current.items[start_byte..end_byte], inserted)) return false;
    // Draft owns every current string; no original site is touched on failure.
    const items = try a.alloc(sites_module.Site, sites.items.len);
    var owned: usize = 0;
    errdefer {
        for (items[0..owned]) |site| a.free(site.text);
        a.free(items);
    }
    for (sites.items, items) |site, *copy| {
        copy.* = site;
        copy.text = try a.dupe(u8, site.text);
        owned += 1;
    }
    var draft: sites_module.Sites = .{ .items = items };
    var cursor: usize = 0;
    var inserted_once = false;
    var changed = false;
    for (sites.items, locations, 0..) |site, location, index| {
        if (location.paragraph_ordinal != paragraph) continue;
        const count = try unitCount(site.text);
        const stop = cursor + count;
        const insert_here = !inserted_once and start >= cursor and start <= stop;
        const low = @max(@as(usize, start), cursor);
        const high = @min(@as(usize, end), stop);
        if (insert_here or high > low) {
            const local_start: u32 = @intCast(if (insert_here) start - cursor else low - cursor);
            const local_delete: u32 = @intCast(if (high > low) high - low else 0);
            changed = (try edit.splice(a, &draft, index, local_start, local_delete, if (insert_here) inserted else "", max_bytes)) or changed;
            if (insert_here) inserted_once = true;
        }
        cursor = stop;
    }
    if (!inserted_once) return error.InvalidTextPosition;
    var bytes: usize = 0;
    for (draft.items) |site| {
        if (site.text.len > max_bytes -| bytes) return error.LimitExceeded;
        bytes += site.text.len;
    }
    if (!changed) {
        draft.deinit(a);
        owned = 0;
        return false;
    }
    sites.deinit(a);
    sites.* = draft;
    return true;
}

fn unitCount(text: []const u8) !usize {
    var offset: usize = 0;
    var units: usize = 0;
    while (try scalars.read(text, offset, .utf8)) |scalar| {
        units += if (scalar.value > 0xffff) @as(usize, 2) else 1;
        offset = scalar.end;
    }
    return units;
}
