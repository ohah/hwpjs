const std = @import("std");
const t = std.testing;
const Tree = @import("xml_part_tree.zig").Tree;
const V = @import("paragraph_structure_values.zig");
const helper = @import("empty_continuation_style.zig");
const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0'><p:run charPrIDRef='6'><p:t>AB</p:t></p:run><p:run charPrIDRef='5'><p:t>CD</p:t></p:run></p:p></s:sec>";
fn values(a: std.mem.Allocator, tree: *const Tree) !V.Values {
    var sites = try @import("text_sites.zig").collect(a, tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, tree, &sites, .{});
    defer a.free(locations);
    var count: @import("section_text.zig").Report = .{};
    return @import("paragraph_structure_collect.zig").collect(a, tree, &sites, locations, .{}, &count);
}
fn run(a: std.mem.Allocator, tree: *const Tree, before: *const V.Values) !void {
    var after = try @import("paragraph_structure_split.zig").prepare(a, tree, before, 0, 4, 4, 2, 100000);
    defer after.deinit(a);
    const right = &after.paragraphs[1];
    const length = right.sites.items.len;
    helper.apply(a, tree, &before.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100) catch |err| {
        try t.expect(right.character_styles == null);
        try t.expectEqual(length, right.sites.items.len);
        for (right.sites.items) |site| try t.expectEqual(@as(usize, 0), site.text.len);
        return err;
    };
    try t.expectEqual(@as(usize, 2), right.sites.items.len);
    try t.expectEqual(@as(?u32, 5), right.character_styles.?[0].char_shape_id);
    try t.expectEqual(@as(?u32, 5), right.character_styles.?[1].char_shape_id);
    var cloned = try right.clone(a);
    defer cloned.deinit(a);
    try t.expectEqual(@as(?u32, 5), cloned.character_styles.?[0].char_shape_id);
}
test "continuation helper OOM keeps all source sites and uncommitted style atomic" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var original = try values(a, &tree);
    defer original.deinit(a);
    var counter = t.FailingAllocator.init(a, .{});
    var nr: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = counter.allocator() };
    try run(nr.allocator(), &tree, &original);
    if (counter.alloc_index > 6000) return error.TestAllocationSweepBudgetExceeded;
    try @import("../testing/allocation_failures.zig").check(run, .{ &tree, &original });
    try t.expect(original.paragraphs[0].character_styles == null);
    try t.expectEqualStrings("AB", original.paragraphs[0].sites.items[0].text);
    try t.expectEqualStrings("CD", original.paragraphs[0].sites.items[1].text);
}
test "continuation helper rejects altered binding invalid resource and span budget without mutation" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var original = try values(a, &tree);
    defer original.deinit(a);
    var after = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 4, 4, 2, 100000);
    defer after.deinit(a);
    const right = &after.paragraphs[1];
    try t.expectError(error.LimitExceeded, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 1));
    try t.expect(right.character_styles == null);
    try t.expectError(error.InvalidResourceReference, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 6 }, 100));
    try t.expect(right.character_styles == null);
    const saved = right.sites.items[0].start;
    right.sites.items[0].start += 1;
    try t.expectError(error.InvalidTextSites, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    right.sites.items[0].start = saved;
    try helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100);
    const complete = right.character_styles.?;
    right.character_styles = complete[0..1];
    try t.expectError(error.InvalidTextSites, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    right.character_styles = complete;
    const first = complete[0];
    complete[0] = complete[1];
    complete[1] = first;
    try t.expectError(error.SourceBindingMismatch, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    complete[1] = complete[0];
    complete[0] = first;
    const element = original.paragraphs[0].sites.items[0].element_index;
    const child = tree.elements[element].first_child;
    tree.elements[element].first_child = tree.elements.len;
    try t.expectError(error.SourceBindingMismatch, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    tree.elements[element].first_child = child;
    right.character_styles.?[0].run_element = 0;
    try t.expectError(error.SourceBindingMismatch, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
}
test "continuation helper leaves middle split and selected deletion policy unchanged" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var original = try values(a, &tree);
    defer original.deinit(a);
    var middle = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 2, 2, 2, 100000);
    defer middle.deinit(a);
    try helper.apply(a, &tree, &original.paragraphs[0], &middle.paragraphs[1], 2, 2, &.{ 3, 5, 6 }, 100);
    try t.expect(middle.paragraphs[1].character_styles == null);
    try t.expectEqualStrings("CD", middle.paragraphs[1].sites.items[1].text);
    var selected = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 2, 4, 2, 100000);
    defer selected.deinit(a);
    try helper.apply(a, &tree, &original.paragraphs[0], &selected.paragraphs[1], 2, 4, &.{ 3, 5, 6 }, 100);
    try t.expect(selected.paragraphs[1].character_styles == null);
}
