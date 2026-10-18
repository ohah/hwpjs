const std = @import("std");
const trees = @import("xml_part_tree.zig");
const anchors = @import("run_anchor.zig");
const edit = @import("anchor_paragraph_edit.zig");

test "HWPX unknown object anchor requires exact direct run ownership and stable kind IDs" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:p><p:run><p:unknownObj nativectrlid='610496364'><p:future/></p:unknownObj><x:unknownObj/><p:ctrl><p:unknownObj/></p:ctrl></p:run><p:unknownObj/></p:p></s:sec>";
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var checked: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.name.local.equals("unknownObj", false)) continue;
        if (checked == 0) try std.testing.expectEqual(anchors.Kind.unknown_object, anchors.kind(&tree, index).?) else try std.testing.expect(anchors.kind(&tree, index) == null);
        checked += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), checked);
    try std.testing.expectEqual(@as(u8, 20), @intFromEnum(anchors.Kind.dutmal));
    try std.testing.expectEqual(@as(u8, 21), @intFromEnum(anchors.Kind.unknown_object));
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "HWPX unknown object anchor preserves opaque payload and every allocation failure" {
    const a = std.testing.allocator;
    const object = "<p:unknownObj nativectrlid='610496364'><p:future opaque='retained'/></p:unknownObj>";
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t>" ++ object ++ "<p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var sites = try @import("text_sites.zig").collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try @import("text_site_locations.zig").build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            var axis = try @import("title_mark_axis.zig").build(allocator, parsed, &sites, locations, 1);
            defer axis.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 5), axis.display_units);
            try std.testing.expectEqual(@as(usize, 12), axis.source_units);
            try std.testing.expectEqual(@as(usize, 1), axis.marks.len);
            try std.testing.expectEqual(@as(usize, 3), axis.marks[0].display_unit);
            try std.testing.expectEqual(@as(usize, 3), axis.marks[0].source_unit);
            try std.testing.expectError(error.ProtectedInlineControl, edit.splice(std.testing.allocator, parsed, &sites, locations, 1, 3, 1, "", 10000));
            _ = edit.splice(allocator, parsed, &sites, locations, 1, 4, 1, "뒤😀<&", 10000) catch |err| {
                try std.testing.expectEqualStrings("A😀", sites.items[0].text);
                try std.testing.expectEqualStrings("B", sites.items[1].text);
                return err;
            };
            const display = try edit.text(allocator, parsed, &sites, locations, 1, 10000);
            defer allocator.free(display);
            try std.testing.expectEqualStrings("A😀\xef\xbf\xbc뒤😀<&", display);
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, object) != null);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:t>뒤😀&lt;&amp;</p:t>") != null);
        }
    }.run, .{&tree});
}
