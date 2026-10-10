//! Resolve paragraph UTF-16 coordinates through the existing anchor projection.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Location = @import("section_text.zig").Location;
pub const Target = struct { site_index: usize, local_unit: u32 };

pub fn resolve(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, paragraph: usize, unit: u32) !Target {
    const positions = try @import("anchor_text_positions.zig").build(a, tree, sites, locations, paragraph);
    defer a.free(positions);
    try @import("paragraph_text_positions.zig").validateBoundary(sites, positions, unit);
    // At a shared text boundary choose the preceding real text site. The
    // resulting control is a run child, never a child of an inline tab/object.
    for (positions) |position| {
        if (position.kind != .text or unit < position.start_unit or unit > position.end_unit) continue;
        if (position.index >= sites.items.len) return error.InvalidTextSites;
        const site = sites.items[position.index];
        if (site.missing_text or site.anchor_boundary) continue;
        const local = std.math.cast(u32, unit - position.start_unit) orelse return error.LimitExceeded;
        return .{ .site_index = position.index, .local_unit = local };
    }
    return error.UnsupportedColumnBoundaryTarget;
}

test "column boundary targets include tab object and Unicode offsets without a second text owner" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr/></p:ctrl><p:t>A😀<p:tab/>B</p:t><p:tbl/><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectEqual(Target{ .site_index = 0, .local_unit = 3 }, try resolve(a, &tree, &sites, locations, 1, 3));
    try std.testing.expectEqual(Target{ .site_index = 1, .local_unit = 0 }, try resolve(a, &tree, &sites, locations, 1, 4));
    try std.testing.expectEqual(Target{ .site_index = 2, .local_unit = 0 }, try resolve(a, &tree, &sites, locations, 1, 6));
    try std.testing.expectEqual(Target{ .site_index = 2, .local_unit = 1 }, try resolve(a, &tree, &sites, locations, 1, 7));
    try std.testing.expectError(error.SplitSurrogatePair, resolve(a, &tree, &sites, locations, 1, 2));
    try std.testing.expectError(error.InvalidTextPosition, resolve(a, &tree, &sites, locations, 1, 8));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Sites, bound: []const Location) !void {
            try std.testing.expectEqual(Target{ .site_index = 2, .local_unit = 0 }, try resolve(allocator, parsed, current, bound, 1, 6));
        }
    }.run, .{ &tree, &sites, locations });
    try std.testing.expectEqualStrings(xml, tree.source);
}
