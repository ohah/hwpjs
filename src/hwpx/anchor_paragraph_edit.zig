//! Structural permission, source positions and shared atomic text transaction.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const positions = @import("anchor_text_positions.zig");

pub fn segments(a: std.mem.Allocator, tree: *const trees.Tree, sites: *const sites_mod.Sites, locations: []const scanner.Location, paragraph: usize) ![]@import("paragraph_text_positions.zig").Segment {
    try @import("plain_paragraph_policy.zig").validateWithAnchors(tree, sites, locations, paragraph);
    return positions.build(a, tree, sites, locations, paragraph);
}

pub fn splice(a: std.mem.Allocator, tree: *const trees.Tree, sites: *sites_mod.Sites, locations: []const scanner.Location, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    const projected = try segments(a, tree, sites, locations, paragraph);
    defer a.free(projected);
    return @import("text_splice_transaction.zig").spliceProjected(a, sites, projected, start, deleted, inserted, max_bytes, null);
}

pub fn text(a: std.mem.Allocator, tree: *const trees.Tree, sites: *const sites_mod.Sites, locations: []const scanner.Location, paragraph: usize, max_bytes: usize) ![]u8 {
    const projected = try segments(a, tree, sites, locations, paragraph);
    defer a.free(projected);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (projected) |segment| {
        const value = @import("paragraph_text_positions.zig").segmentText(sites, segment);
        if (value.len > max_bytes -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, value);
    }
    return output.toOwnedSlice(a);
}
