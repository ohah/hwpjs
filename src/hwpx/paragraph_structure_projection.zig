//! Ephemeral source-binding text projection for formula evaluation, never SSOT.
const std = @import("std");
const sites_mod = @import("text_sites.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;

pub fn collect(a: std.mem.Allocator, tree: *const Tree, current: *const Values, options: sites_mod.Options) !sites_mod.Sites {
    var result = try sites_mod.collect(a, tree, options);
    errdefer result.deinit(a);
    const Key = struct { element: usize, start: usize };
    var indices: std.AutoHashMapUnmanaged(Key, usize) = .empty;
    defer indices.deinit(a);
    const seen = try a.alloc(bool, result.items.len);
    defer a.free(seen);
    @memset(seen, false);
    const texts = try a.alloc(std.ArrayList(u8), result.items.len);
    for (texts) |*text| text.* = .empty;
    defer {
        for (texts) |*text| text.deinit(a);
        a.free(texts);
    }
    for (result.items, 0..) |site, index| {
        const entry = try indices.getOrPut(a, .{ .element = site.element_index, .start = site.start });
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    var bytes: usize = 0;
    for (current.paragraphs) |*paragraph| {
        if (paragraph.protected_positions != null) {
            const positions = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
            a.free(positions);
        } else if (paragraph.joined()) |view| {
            const positions = try @import("paragraph_joined_positions.zig").build(a, tree, &view);
            a.free(positions);
        } else if (paragraph.sites.items.len != 0) {
            const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
            a.free(locations);
        }
        for (paragraph.sites.items) |site| {
            const index = indices.get(.{ .element = site.element_index, .start = site.start }) orelse return error.SourceBindingMismatch;
            const original = result.items[index];
            if (original.end != site.end or original.empty_element != site.empty_element or original.missing_text != site.missing_text or original.anchor_boundary != site.anchor_boundary) return error.SourceBindingMismatch;
            if (site.text.len > options.max_text_bytes -| bytes) return error.LimitExceeded;
            bytes += site.text.len;
            try texts[index].appendSlice(a, site.text);
            seen[index] = true;
        }
    }
    for (seen) |present| if (!present) return error.SourceBindingMismatch;
    for (result.items, texts) |*site, *text| {
        const owned = try text.toOwnedSlice(a);
        a.free(site.text);
        site.text = owned;
    }
    return result;
}

test "HWPX structural formula projection derives split text without changing authority" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A😀B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    var current = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 1, 1, 2, 10000);
    defer current.deinit(a);
    _ = try @import("paragraph_structure_splice.zig").splice(a, &tree, &current, 1, 0, 0, "현재", 10000);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, model: *const Values) !void {
            var projected = try collect(allocator, source, model, .{});
            defer projected.deinit(allocator);
            try std.testing.expectEqualStrings("A현재😀B", projected.items[0].text);
            try std.testing.expectEqualStrings("A", model.paragraphs[0].sites.items[0].text);
            try std.testing.expectEqualStrings("현재😀B", model.paragraphs[1].sites.items[0].text);
        }
    }.run, .{ &tree, &current });
    try std.testing.expectError(error.LimitExceeded, collect(a, &tree, &current, .{ .max_text_bytes = 1 }));
}
