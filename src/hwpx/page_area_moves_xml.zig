//! 같은 원본 문단 안에서 검증된 쪽 영역 컨테이너를 이동합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Location = @import("section_text.zig").Location;
const Position = @import("page_area_position.zig").Position;

pub fn write(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, paragraph: usize, positions: []const Position, limit: usize) ![]u8 {
    if (positions.len > tree.elements.len or tree.source.len > limit) return error.LimitExceeded;
    const common = @import("metadata_control_moves.zig");
    const moves = try a.alloc(common.Move, positions.len);
    defer a.free(moves);
    for (positions, moves) |position, *move| {
        const control = try @import("page_area_text_xml.zig").control(tree, position.source_element);
        if (control != position.source_control) return error.SourceBindingMismatch;
        move.* = .{ .source_element = position.source_element, .source_control = control, .unit = position.unit };
    }
    return common.write(a, tree, sites, locations, paragraph, moves, limit, @import("page_area_text_xml.zig").writeManyFrom);
}

test "page area moves XML relocates two controls once and preserves other owners" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:ctrl><p:header id='1'><p:subList><p:p><p:run><p:t>HEAD</p:t></p:run><p:linesegarray/></p:p></p:subList></p:header></p:ctrl><p:ctrl><p:footer id='2'><p:subList><p:p><p:run><p:t>FOOT</p:t></p:run></p:p></p:subList></p:footer></p:ctrl><p:t>A😀&lt;&amp;B</p:t></p:run></p:p><p:p><p:run><p:t>other</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const positions = try @import("page_area_source_positions.zig").collect(a, &tree, 1, &.{}, 2);
    defer a.free(positions);
    positions[0].unit = 3;
    positions[1].unit = 5;
    const output = try write(a, &tree, &sites, locations, 1, positions, 10000);
    defer a.free(output);
    var restored = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer restored.deinit(a);
    var current = try @import("text_sites.zig").collect(a, &restored, .{});
    defer current.deinit(a);
    const rows = try @import("text_site_locations.zig").build(a, &restored, &current, .{});
    defer a.free(rows);
    const segments = try @import("anchor_text_positions.zig").build(a, &restored, &current, rows, 1);
    defer a.free(segments);
    const inventory = try @import("page_area_source_positions.zig").collect(a, &restored, 1, segments, 2);
    defer a.free(inventory);
    try std.testing.expectEqual(@as(usize, 2), inventory.len);
    for (positions, inventory) |before, after| {
        try std.testing.expectEqual(before.unit, after.unit);
        try std.testing.expectEqualStrings(tree.sourceOf(before.source_element), restored.sourceOf(after.source_element));
    }
    for (current.items, [_][]const u8{ "A😀", "HEAD", "<&", "FOOT", "B", "other" }) |site, expected| try std.testing.expectEqualStrings(expected, site.text);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:p><p:run><p:t>other</p:t></p:run></p:p>") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "charPrIDRef='7'"));
    try std.testing.expectError(error.DuplicateMetadataControl, write(a, &tree, &sites, locations, 1, &.{ positions[0], positions[0] }, 10000));
    try std.testing.expectError(error.CrossParagraphOwner, write(a, &tree, &sites, locations, 4, positions, 10000));
    var invalid = positions[0];
    invalid.unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, write(a, &tree, &sites, locations, 1, &.{invalid}, 10000));
    invalid = positions[0];
    invalid.source_control = 0;
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, &sites, locations, 1, &.{invalid}, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const Tree, text: *const Sites, bound: []const Location, moves: []const Position) !void {
            const result = try write(allocator, original, text, bound, 1, moves, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, &sites, locations, positions });
    try std.testing.expectEqualStrings(source, tree.source);
}
