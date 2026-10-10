const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const marker = "<p:ctrl><p:bookmark name='책&amp;갈피'/><p:newNum num='1' numType='PAGE'/><p:pageNum pos='BOTTOM_CENTER'/></p:ctrl>";
const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t>" ++ marker ++ "<p:t>B</p:t></p:run></p:p></s:sec>";
fn case(a: std.mem.Allocator) !void {
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var axis = try @import("title_mark_axis.zig").build(a, &tree, &sites, locations, 1);
    defer axis.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), axis.display_units);
    try std.testing.expectEqual(@as(usize, 28), axis.source_units);
    try std.testing.expectEqual(.bookmark, axis.marks[0].kind);
    try std.testing.expectEqual(@as(usize, 3), try axis.toSource(3, .before));
    try std.testing.expectEqual(@as(usize, 27), try axis.toSource(3, .after));
    try std.testing.expectError(error.ProtectedInlineControl, axis.toDisplay(4));
    _ = try @import("plain_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 0, 0, "앞😀", 10000);
    var changed = try @import("title_mark_axis.zig").build(a, &tree, &sites, locations, 1);
    defer changed.deinit(a);
    try std.testing.expectEqual(@as(usize, 6), changed.marks[0].display_unit);
    try std.testing.expectEqual(@as(usize, 31), changed.source_units);
    const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, marker) != null);
}
test "HWPX retained bookmark axis preserves eight unit source records under OOM" {
    try @import("../testing/allocation_failures.zig").check(case, .{});
}
test "HWPX retained bookmark rejects hidden body foreign namespace and mixed unknown settings" {
    const a = std.testing.allocator;
    inline for (.{ "<p:bookmark>hidden</p:bookmark>", "<p:bookmark><p:t/></p:bookmark>", "<x:bookmark xmlns:x='urn:other'/>", "<p:bookmark/><p:colPr/>", "<p:bookmark/><p:future/>" }) |body| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl>" ++ body ++ "</p:ctrl><p:t>A</p:t></p:run></p:p></s:sec>";
        var tree = try trees.parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expect(!@import("retained_bookmark.zig").supported(&tree, 3));
    }
}

test "HWPX retained bookmark mixed object axis keeps display and source widths distinct" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:ctrl><p:bookmark name='point'/></p:ctrl><p:rect/><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var axis = try @import("title_mark_axis.zig").build(a, &tree, &sites, locations, 1);
    defer axis.deinit(a);
    try std.testing.expectEqual(@as(usize, 5), axis.display_units);
    try std.testing.expectEqual(@as(usize, 20), axis.source_units);
    try std.testing.expectEqual(@as(usize, 3), try axis.toSource(3, .before));
    try std.testing.expectEqual(@as(usize, 11), try axis.toSource(3, .after));
    try std.testing.expectEqual(@as(usize, 19), try axis.toSource(4, .before));
    try std.testing.expectEqual(@as(usize, 4), try axis.toDisplay(19));
    try std.testing.expectError(error.ProtectedInlineControl, axis.toDisplay(12));
    try std.testing.expectError(error.UnsupportedParagraphControl, @import("plain_paragraph_policy.zig").validate(&tree, &sites, locations, 1));
    try @import("plain_paragraph_policy.zig").validateWithAnchors(&tree, &sites, locations, 1);
    try std.testing.expectError(error.ProtectedInlineControl, @import("anchor_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 3, 1, "", 10000));
}

test "HWPX retained bookmark actual direct run form retains section column and table source units" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue2527_empty_linesegs.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const options: sites_mod.Options = .{ .materialize_anchor_boundaries = true };
    var sites = try sites_mod.collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    var before = try @import("title_mark_axis.zig").build(a, &tree, &sites, locations, 1);
    defer before.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), before.display_units);
    try std.testing.expectEqual(@as(usize, 32), before.source_units);
    try std.testing.expectEqual(@as(usize, 4), before.marks.len);
    try std.testing.expectEqual(.bookmark, before.marks[2].kind);
    try std.testing.expectEqual(@as(usize, 24), try before.toSource(0, .after));
    try std.testing.expectEqual(@as(usize, 32), try before.toSource(1, .before));
    _ = try @import("anchor_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 0, 0, "앞😀", 10000);
    var after = try @import("title_mark_axis.zig").build(a, &tree, &sites, locations, 1);
    defer after.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), after.display_units);
    try std.testing.expectEqual(@as(usize, 35), after.source_units);
    try std.testing.expectEqual(@as(usize, 0), after.marks[2].display_unit);
    try std.testing.expectEqual(@as(usize, 3), after.marks[3].display_unit);
}
