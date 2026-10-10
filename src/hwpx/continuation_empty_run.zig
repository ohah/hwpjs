//! Source-bound empty text sites for runs emptied by continuation metadata removal.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const text = @import("text_sites.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn eligible(tree: *const Tree, owner: usize, index: usize) bool {
    if (owner >= tree.elements.len or index >= tree.elements.len) return false;
    const run = tree.elements[index];
    if (!run.is(uri, "run") or run.parent != owner or run.end_tag == null or run.first_child == null) return false;
    var cursor = run.start_tag.end;
    var child = run.first_child;
    while (child) |i| {
        const node = tree.elements[i];
        if (!@import("paragraph_continuation_metadata.zig").remove(node, true)) return false;
        if (!whitespace(tree.source[cursor..node.start_tag.start])) return false;
        cursor = node.end;
        child = node.next_sibling;
    }
    return whitespace(tree.source[cursor..run.end_tag.?.start]);
}

pub fn valid(tree: *const Tree, owner: usize, site: text.Site) bool {
    if (!eligible(tree, owner, site.element_index)) return false;
    const offset = tree.elements[site.element_index].end_tag.?.start;
    return site.missing_text and !site.anchor_boundary and !site.empty_element and site.start == offset and site.end == offset;
}

pub fn clone(a: std.mem.Allocator, tree: *const Tree, owner: usize, sites: *const text.Sites) !text.Sites {
    var items: std.ArrayList(text.Site) = .empty;
    errdefer {
        for (items.items) |site| a.free(site.text);
        items.deinit(a);
    }
    for (sites.items) |site| {
        var copy = site;
        copy.text = try a.dupe(u8, site.text);
        errdefer a.free(copy.text);
        try items.append(a, copy);
    }
    for (tree.elements, 0..) |run, index| {
        if (!eligible(tree, owner, index)) continue;
        var present = false;
        for (sites.items) |site| if (site.element_index == index) {
            present = true;
            break;
        };
        if (present) continue;
        const empty = try a.dupe(u8, "");
        errdefer a.free(empty);
        const offset = run.end_tag.?.start;
        try items.append(a, .{ .element_index = index, .start = offset, .end = offset, .text = empty, .missing_text = true });
    }
    std.mem.sort(text.Site, items.items, {}, struct {
        fn less(_: void, left: text.Site, right: text.Site) bool {
            return left.start < right.start;
        }
    }.less);
    return .{ .items = try items.toOwnedSlice(a) };
}

fn whitespace(bytes: []const u8) bool {
    for (bytes) |byte| if (byte != ' ' and byte != '\t' and byte != '\r' and byte != '\n') return false;
    return true;
}

test "continuation empty run sites preserve source bindings and allocation failures" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:secPr/></p:run><p:run><p:t>AB</p:t></p:run><p:run>opaque<p:secPr/></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try text.collect(a, &tree, .{});
    defer sites.deinit(a);
    var augmented = try clone(a, &tree, 1, &sites);
    defer augmented.deinit(a);
    try std.testing.expectEqual(sites.items.len + 1, augmented.items.len);
    try std.testing.expect(valid(&tree, 1, augmented.items[0]));
    var invalid = augmented.items[0];
    invalid.start -= 1;
    try std.testing.expect(!valid(&tree, 1, invalid));
    try std.testing.expect(!valid(&tree, 0, augmented.items[0]));
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_split_xml.zig").writeSites(a, &tree, 1, &augmented, false, 0, 10000));
    const forged_items = try a.alloc(text.Site, augmented.items.len + 1);
    defer a.free(forged_items);
    @memcpy(forged_items[0..augmented.items.len], augmented.items);
    forged_items[augmented.items.len] = augmented.items[0];
    const forged: text.Sites = .{ .items = forged_items };
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_split_xml.zig").writeSites(a, &tree, 1, &forged, true, 2, 10000));
    const binding = augmented.items[0];
    augmented.items[0] = invalid;
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_split_xml.zig").writeSites(a, &tree, 1, &augmented, true, 2, 10000));
    augmented.items[0] = binding;
    var again = try clone(a, &tree, 1, &augmented);
    defer again.deinit(a);
    try std.testing.expectEqual(augmented.items.len, again.items.len);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const text.Sites) !void {
            var result = try clone(allocator, parsed, 1, current);
            defer result.deinit(allocator);
        }
    }.run, .{ &tree, &sites });
}

test "continuation empty run repeated split owns empty sites on both sides" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='9'><p:secPr/></p:run><p:run><p:t>ABC</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try text.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer values.deinit(a);
    var first = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 1, 1, 2, 10000);
    defer first.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), first.paragraphs[1].sites.items.len);
    var repeated = try @import("paragraph_structure_split.zig").prepare(a, &tree, &first, 1, 1, 1, 3, 10000);
    defer repeated.deinit(a);
    for (repeated.paragraphs[1..]) |part| {
        try std.testing.expectEqual(@as(usize, 2), part.sites.items.len);
        try std.testing.expect(valid(&tree, 1, part.sites.items[0]));
        const saved = try @import("paragraph_split_xml.zig").writeSites(a, &tree, 1, &part.sites, true, part.generated_id.?, 10000);
        defer a.free(saved);
        try std.testing.expect(std.mem.indexOf(u8, saved, "<p:run charPrIDRef='9'><p:t></p:t></p:run>") != null);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const @import("paragraph_structure_values.zig").Values) !void {
            var result = try @import("paragraph_structure_split.zig").prepare(allocator, parsed, current, 1, 1, 1, 3, 10000);
            defer result.deinit(allocator);
        }
    }.run, .{ &tree, &first });
    try std.testing.expectEqual(@as(usize, 1), first.paragraphs[1].sites.items.len);
    try std.testing.expectEqualStrings("BC", first.paragraphs[1].sites.items[0].text);
}
