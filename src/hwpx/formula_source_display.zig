//! Source display authority for unchanged read projections, not manual inference.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;

pub fn unchanged(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, options: @import("text_sites.zig").Options) !bool {
    var original = try @import("text_sites.zig").collect(a, tree, options);
    defer original.deinit(a);
    if (original.items.len != sites.items.len) return false;
    for (original.items, sites.items) |before, after| {
        const change = @import("text_sites_save.zig").siteChange(tree, before, after) catch |err| switch (err) {
            error.InvalidTextSites => return false,
        };
        if (change != null) return false;
    }
    return true;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, range: @import("field_text_ranges.zig").Range) ![]u8 {
    var display: std.ArrayList(u8) = .empty;
    defer display.deinit(a);
    const limit = @import("formula_result_sites.zig").max_display_bytes;
    for (sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const element = tree.elements[site.element_index];
        if (element.start_tag.start < range.content_start or element.start_tag.start >= range.content_end) continue;
        if (site.text.len > limit - display.items.len) return error.LimitExceeded;
        try display.appendSlice(a, site.text);
    }
    // The ordinary result preparation subsequently checks shape/ownership.
    return display.toOwnedSlice(a);
}

test "HWPX source formula display recognizes only unchanged source bindings under OOM" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expect(try unchanged(a, &tree, &sites, .{}));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, t: *const Tree, s: *const Sites) !void {
            try std.testing.expect(try unchanged(allocator, t, s, .{}));
        }
    }.run, .{ &tree, &sites });
    const truncated: Sites = .{ .items = sites.items[0..1] };
    try std.testing.expect(!try unchanged(a, &tree, &truncated, .{}));
    const prior = sites.items[0].element_index;
    sites.items[0].element_index = tree.elements.len;
    try std.testing.expect(!try unchanged(a, &tree, &sites, .{}));
    sites.items[0].element_index = prior;
    a.free(sites.items[0].text);
    sites.items[0].text = try a.dupe(u8, "5");
    try std.testing.expect(!try unchanged(a, &tree, &sites, .{}));
}
