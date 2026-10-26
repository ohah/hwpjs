//! A vacated outside-field run must not become a new inside-field input site.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Position = @import("field_position.zig").Position;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn omit(a: std.mem.Allocator, tree: *const Tree, row: *const Paragraph, run: usize, owned: []const Position, has_text: bool) !bool {
    if (!has_text) return false;
    if (run >= tree.elements.len) return error.InvalidElementIndex;
    if (!@import("element_whitespace_gaps.zig").empty(tree, run)) return false;
    var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, run);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try @import("../xml/root.zig").namespaces.isDeclaration(attribute.name)) continue;
        if (!attribute.name.equals("charPrIDRef", false)) return false;
    }
    var marker: ?usize = null;
    var source_texts: usize = 0;
    var child = tree.elements[run].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const node = tree.elements[index];
        if (node.is(uri, "t")) {
            if (node.first_child != null) return false;
            source_texts += 1;
        } else if (node.is(uri, "ctrl") and @import("retained_field_marker.zig").supported(tree, index)) {
            const begin = node.first_child.?;
            if (!tree.elements[begin].is(uri, "fieldBegin") or marker != null) return false;
            for (owned) |position| if (position.element_index == begin) return false;
            marker = begin;
        } else return false;
    }
    const begin = marker orelse return false;
    var selected: usize = 0;
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (row.sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const node = tree.elements[site.element_index];
        if (node.parent != run) continue;
        const entry = try seen.getOrPut(a, site.element_index);
        if (entry.found_existing) return false;
        if (!node.is(uri, "t") or site.text.len != 0 or site.empty_element or site.missing_text or site.anchor_boundary or site.end >= tree.elements[begin].start_tag.start or site.end <= site.start) return false;
        const ending = node.end_tag orelse return false;
        if (site.start != node.start_tag.end or site.end != ending.start) return false;
        if (std.mem.indexOfScalar(u8, tree.source[site.start..site.end], '<') != null) return false;
        var text_tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, site.element_index);
        defer text_tag.deinit(a);
        for (text_tag.attributes) |attribute| if (!try @import("../xml/root.zig").namespaces.isDeclaration(attribute.name)) return false;
        selected += 1;
    }
    return selected != 0 and selected == source_texts;
}

test "field vacated outside run omission preserves real text marker ownership and empty paragraphs" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='5'><p:t>outside</p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run><p:run charPrIDRef='6'><p:t>inside</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const row: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites };
    try std.testing.expect(!try omit(a, &tree, &row, 2, &.{}, true));
    a.free(sites.items[0].text);
    sites.items[0].text = try a.dupe(u8, "");
    try std.testing.expect(try omit(a, &tree, &row, 2, &.{}, true));
    try std.testing.expect(!try omit(a, &tree, &row, 2, &.{}, false));
    const marker = tree.elements[tree.elements[tree.elements[2].first_child.?].next_sibling.?].first_child.?;
    try std.testing.expect(!try omit(a, &tree, &row, 2, &.{.{ .element_index = marker, .begin_element = marker, .kind = .begin, .unit = 0 }}, true));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, current: *const Paragraph) !void {
            try std.testing.expect(try omit(allocator, source, current, 2, &.{}, true));
        }
    }.run, .{ &tree, &row });
}

test "field vacated outside run retains annotations original empty sites and opaque content" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:run charPrIDRef='5' keep='yes'><p:t>outside</p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t keep='yes'>outside</p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t><!--keep-->outside</p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t>outside<!--keep--></p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t><![CDATA[outside]]></p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t/><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t></p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t>outside</p:t><p:pic/><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
        "<p:run charPrIDRef='5'><p:t>outside</p:t><!--keep--><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run>",
    }) |run| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", run, "<p:run><p:t>inside</p:t></p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        try std.testing.expect(sites.items.len >= 2);
        a.free(sites.items[0].text);
        sites.items[0].text = try a.dupe(u8, "");
        const row: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites };
        try std.testing.expect(!try omit(a, &tree, &row, 2, &.{}, true));
        try std.testing.expectEqualSlices(u8, xml, tree.source);
    }
}

test "field vacated outside run refuses missing and duplicate source sites" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:t>B</p:t><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run><p:run><p:t>inside</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), sites.items.len);
    for (sites.items[0..2]) |*site| {
        a.free(site.text);
        site.text = try a.dupe(u8, "");
    }
    var row: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites };
    try std.testing.expect(try omit(a, &tree, &row, 2, &.{}, true));
    row.sites.items = sites.items[1..];
    try std.testing.expect(!try omit(a, &tree, &row, 2, &.{}, true));
    var duplicate = [_]@import("text_sites.zig").Site{ sites.items[1], sites.items[1], sites.items[2] };
    row.sites.items = &duplicate;
    try std.testing.expect(!try omit(a, &tree, &row, 2, &.{}, true));
}
