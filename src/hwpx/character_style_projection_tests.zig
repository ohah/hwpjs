const std = @import("std");
const projection = @import("character_style_projection.zig");
test "HWPX character style projection uses current lengths and preserves absent and zero IDs" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:t>A</p:t></p:run><p:run><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    a.free(sites.items[0].text);
    sites.items[0].text = try a.dupe(u8, "A😀");
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    const spans = try projection.build(a, &tree, &sites, positions, 2);
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 3), spans[0].end_unit);
    try std.testing.expectEqual(@as(usize, 3), spans[1].start_unit);
    try std.testing.expectEqual(@as(usize, 4), spans[1].end_unit);
    try std.testing.expectEqual(@as(?u32, 0), spans[0].source_char_shape_id);
    try std.testing.expectEqual(@as(?u32, null), spans[1].source_char_shape_id);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.LimitExceeded, projection.build(a, &tree, &sites, positions, 1));
    var wrong = positions[0];
    wrong.kind = .anchor;
    try std.testing.expectError(error.UnsupportedInlineControl, projection.build(a, &tree, &sites, &.{wrong}, 2));
    wrong = positions[0];
    wrong.index = sites.items.len;
    try std.testing.expectError(error.InvalidTextSites, projection.build(a, &tree, &sites, &.{wrong}, 2));
    wrong = positions[0];
    wrong.start_unit = 1;
    try std.testing.expectError(error.InvalidTextSites, projection.build(a, &tree, &sites, &.{wrong}, 2));
    var wrong_sites = [_]@import("text_sites.zig").Site{sites.items[0]};
    wrong_sites[0].missing_text = true;
    const foreign_missing: @import("text_sites.zig").Sites = .{ .items = &wrong_sites };
    try std.testing.expectError(error.SourceBindingMismatch, projection.build(a, &tree, &foreign_missing, positions[0..1], 2));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, s: *const @import("text_sites.zig").Sites, segments: []const @import("paragraph_text_positions.zig").Segment) !void {
            const result = try projection.build(allocator, t, s, segments, 2);
            defer allocator.free(result);
        }
    }.run, .{ &tree, &sites, positions });
}
