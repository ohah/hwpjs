//! Plain paragraph text across existing styled sites. Inline controls require
//! a separate position projection and are explicitly not flattened here.
const std = @import("std");
const sites_module = @import("text_sites.zig");
const tree_module = @import("xml_part_tree.zig");
const scanner = @import("section_text.zig");

pub fn splice(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *sites_module.Sites, locations: []const scanner.Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    return spliceWithTabs(a, tree, sites, locations, paragraph, start, deleted, inserted, max_bytes, false);
}

pub fn spliceWithTabs(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *sites_module.Sites, locations: []const scanner.Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, allow_tabs: bool) !bool {
    if (locations.len != sites.items.len or paragraph == 0) return error.InvalidTextSites;
    try @import("plain_paragraph_policy.zig").validateWithTabs(tree, sites, locations, paragraph, allow_tabs);
    const positions = try @import("paragraph_text_positions.zig").build(a, tree, sites, locations, paragraph);
    defer a.free(positions);
    return @import("text_splice_transaction.zig").spliceProjected(a, sites, positions, start, deleted, inserted, max_bytes, null);
}
