const std = @import("std");
const trees = @import("xml_part_tree.zig");
fn case(a: std.mem.Allocator, tag: []const u8) !void {
    const object = try std.fmt.allocPrint(a, "<p:{s} id='9' script='never execute'><p:future opaque='yes'/></p:{s}>", .{ tag, tag });
    defer a.free(object);
    const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t>", object, "<p:t>B</p:t></p:run></p:p></s:sec>" });
    defer a.free(xml);
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectError(error.ProtectedInlineControl, @import("anchor_paragraph_edit.zig").splice(std.testing.allocator, &tree, &sites, locations, 1, 3, 1, "", 10000));
    _ = @import("anchor_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 4, 1, "뒤😀", 10000) catch |err| {
        try std.testing.expectEqualStrings("A😀", sites.items[0].text);
        try std.testing.expectEqualStrings("B", sites.items[1].text);
        return err;
    };
    const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, object) != null);
}
test "HWPX form source anchors preserve opaque payload and protected boundaries under OOM" {
    for ([_][]const u8{ "btn", "checkBtn", "comboBox", "radioBtn", "edit" }) |tag| try @import("../testing/allocation_failures.zig").check(case, .{tag});
}
test "HWPX form source anchors reject foreign namespace and indirect placement" {
    const a = std.testing.allocator;
    inline for (.{ "<p:ctrl><p:checkBtn/></p:ctrl>", "<p:t><p:edit/></p:t>", "<x:btn xmlns:x='urn:foreign'/>" }) |body| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>" ++ body ++ "</p:run></p:p></s:sec>";
        var tree = try trees.parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        for (tree.elements, 0..) |_, index| try std.testing.expect(@import("run_anchor.zig").kind(&tree, index) == null);
    }
}
