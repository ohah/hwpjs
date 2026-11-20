const std = @import("std");
const writer = @import("xml_source_writer.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;

// Preserve the previous exhaustive behavior as an independent reference, not
// another production path. New traversal must not delete a nested owner's mark.
fn reference(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, changes: *std.ArrayList(writer.Change)) !void {
    const owned = paragraph.title_positions orelse return;
    const template = tree.elements[paragraph.template_element];
    for (tree.elements, 0..) |marker, index| {
        if (!@import("title_mark_axis.zig").retained(tree, index)) continue;
        const text = marker.parent.?;
        const run = tree.elements[text].parent.?;
        if (tree.elements[run].parent != paragraph.template_element) continue;
        var keep = false;
        for (owned) |position| if (position.element_index == index) {
            keep = true;
            break;
        };
        if (keep) continue;
        const start = marker.start_tag.start - template.start_tag.start;
        const end = marker.end - template.start_tag.start;
        var replaced = false;
        for (changes.items) |change| if (change.start <= start and change.end >= end) {
            replaced = true;
            break;
        };
        if (!replaced) try changes.append(a, .{ .start = start, .end = end, .text = "" });
    }
}
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='7'><p:run><p:t>A<p:titleMark/>B<p:titleMark/>C<p:titleMark/></p:t><p:tbl><p:p id='7'><p:run><p:t><p:titleMark/>nested</p:t></p:run></p:p></p:tbl></p:run></p:p><p:p id='7'><p:run><p:t><p:titleMark/>sibling</p:t></p:run></p:p></s:sec>";
fn compare(a: std.mem.Allocator) !void {
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    const titles = try @import("title_mark_current.zig").read(a, &tree, &values.paragraphs[0]);
    defer a.free(titles);
    try std.testing.expectEqual(@as(usize, 3), titles.len);
    var paragraph = values.paragraphs[0];
    paragraph.title_positions = @constCast(titles[0..1]);
    const base = tree.elements[paragraph.template_element].start_tag.start;
    const covered = tree.elements[titles[1].element_index];
    var before = try std.ArrayList(writer.Change).initCapacity(a, 1);
    defer before.deinit(a);
    try before.append(a, .{ .start = covered.start_tag.start - base, .end = covered.end - base, .text = "" });
    var expected: std.ArrayList(writer.Change) = .empty;
    defer expected.deinit(a);
    try expected.appendSlice(a, before.items);
    try reference(a, &tree, &paragraph, &expected);
    try @import("title_mark_source_changes.zig").append(a, &tree, &paragraph, &before);
    try std.testing.expectEqual(@as(usize, 2), before.items.len);
    try std.testing.expectEqual(expected.items.len, before.items.len);
    for (expected.items, before.items) |old, actual| {
        try std.testing.expectEqual(old.start, actual.start);
        try std.testing.expectEqual(old.end, actual.end);
        try std.testing.expectEqualStrings(old.text, actual.text);
    }
    try std.testing.expectEqualStrings(xml, tree.source);
}
test "title source linear removals preserve nested ownership source spans and reallocating input through OOM" {
    try compare(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(compare, .{});
}
