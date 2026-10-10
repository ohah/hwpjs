//! One source control relocation, assembled atomically with shared XML writers.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Site = @import("text_sites.zig").Site;

pub fn writeAt(a: std.mem.Allocator, tree: *const Tree, source_element: usize, sites: *const @import("text_sites.zig").Sites, locations: []const @import("section_text.zig").Location, paragraph: usize, unit: u32, limit: usize) ![]u8 {
    return @import("column_boundary_moves_xml.zig").write(a, tree, sites, locations, paragraph, &.{.{ .source_element = source_element, .unit = unit, .affinity = .right }}, limit);
}

/// Same original paragraph only. local_unit is relative to the supplied site.
pub fn write(a: std.mem.Allocator, tree: *const Tree, source_element: usize, site: Site, local_unit: u32, limit: usize) ![]u8 {
    const fragment = try @import("column_boundary_text_xml.zig").write(a, tree, site, local_unit, .{ .source_element = source_element, .unit = 0, .affinity = .right }, limit);
    defer a.free(fragment);
    // The fragment serializer has validated all referenced element indices.
    const control = tree.elements[source_element].parent.?;
    const source_run = tree.elements[control].parent.?;
    const target_run = tree.elements[site.element_index].parent.?;
    if (tree.elements[source_run].parent != tree.elements[target_run].parent) return error.CrossParagraphOwner;
    const removed = tree.elements[control];
    const Change = @import("xml_source_writer.zig").Change;
    var changes = [_]Change{
        .{ .start = removed.start_tag.start, .end = removed.end, .text = "" },
        .{ .start = site.start, .end = site.end, .text = "", .serialized_xml = fragment },
    };
    if (changes[0].start > changes[1].start) std.mem.swap(Change, &changes[0], &changes[1]);
    return @import("xml_source_writer.zig").write(a, tree.source, &changes, limit);
}

test "column boundary move XML removes old control and reopens at one current text boundary" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl keep='yes'><p:colPr colCount='2' sameSz='0'><p:colSz width='15291' gap='1744'/><p:colSz width='15733' gap='0'/></p:colPr></p:ctrl><p:t>A😀&lt;&amp;B</p:t></p:run></p:p><p:p><p:run><p:t>other</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var setting: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
        setting = index;
    };
    const output = try write(a, &tree, setting, sites.items[0], 3, 10000);
    defer a.free(output);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var count: usize = 0;
    for (reopened.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
        try std.testing.expectEqualStrings(tree.sourceOf(setting), reopened.sourceOf(index));
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 1), count);
    var current = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer current.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &reopened, &current, .{});
    defer a.free(locations);
    const positions = try @import("anchor_text_positions.zig").build(a, &reopened, &current, locations, 1);
    defer a.free(positions);
    const boundaries = try @import("column_boundary_collect.zig").collect(a, &reopened, reopened.elements[0].first_child.?, positions, .right, 1);
    defer a.free(boundaries);
    try std.testing.expectEqual(@as(u32, 3), boundaries[0].unit);
    try std.testing.expectEqualStrings("A😀", current.items[0].text);
    try std.testing.expectEqualStrings("<&B", current.items[1].text);
    try std.testing.expectEqualStrings("other", current.items[2].text);
    try std.testing.expectError(error.CrossParagraphOwner, write(a, &tree, setting, sites.items[1], 1, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, column: usize, site: Site) !void {
            const result = try write(allocator, parsed, column, site, 3, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, setting, sites.items[0] });
    try std.testing.expectEqualStrings(source, tree.source);
}
