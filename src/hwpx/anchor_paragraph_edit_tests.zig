const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const locations_mod = @import("text_site_locations.zig");
const edit = @import("anchor_paragraph_edit.zig");

test "HWPX anchored paragraph automatic numbers preserve source and protect deletion" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:ctrl><p:autoNum num='-1' numType='TABLE'><p:autoNumFormat type='DIGIT'/></p:autoNum></p:ctrl>",
        "<p:ctrl><p:autoNum num='0'/></p:ctrl>",
    }) |control| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t>", control, "<p:t>B</p:t></p:run></p:p></s:sec>" });
        defer a.free(source);
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_mod.collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try locations_mod.build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(error.ProtectedInlineControl, edit.splice(a, &tree, &sites, locations, 1, 3, 1, "", 10000));
        _ = try edit.splice(a, &tree, &sites, locations, 1, 4, 1, "뒤", 10000);
        const display = try edit.text(a, &tree, &sites, locations, 1, 10000);
        defer a.free(display);
        try std.testing.expectEqualStrings("A😀\xef\xbf\xbc뒤", display);
        const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
        defer a.free(saved);
        try std.testing.expect(std.mem.indexOf(u8, saved, control) != null);
        try std.testing.expect(std.mem.indexOf(u8, saved, "<p:t>뒤</p:t>") != null);
    }
}

test "HWPX anchored paragraph shared transaction survives all allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:pic/><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var sites = try sites_mod.collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try locations_mod.build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = edit.splice(allocator, parsed, &sites, locations, 1, 4, 1, "한<&", 10000) catch |err| {
                try std.testing.expectEqualStrings("A😀", sites.items[0].text);
                try std.testing.expectEqualStrings("B", sites.items[1].text);
                return err;
            };
            const display = try edit.text(allocator, parsed, &sites, locations, 1, 10000);
            defer allocator.free(display);
            try std.testing.expectEqualStrings("A😀\xef\xbf\xbc한<&", display);
            try std.testing.expectEqualSlices(u8, parsed.source, source);
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:pic/><p:t>한&lt;&amp;</p:t>") != null);
        }
    }.run, .{&tree});
}

test "HWPX anchored paragraph refuses mixed controls and hidden wrapper text" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t>";
    const suffix = "<p:t>B</p:t></p:run></p:p></s:sec>";
    for ([_][]const u8{
        "<p:ctrl><p:footNote/><p:fieldBegin/></p:ctrl>",
        "<p:ctrl>hidden<p:footNote/></p:ctrl>",
        "<p:ctrl><p:footNote/>hidden</p:ctrl>",
        "<p:ctrl><!--hidden--><p:footNote/></p:ctrl>",
        "<p:ctrl><p:footNote/><?hidden data?></p:ctrl>",
        "<p:ctrl><![CDATA[hidden]]><p:footNote/></p:ctrl>",
        "<p:ctrl>&#32;<p:footNote/></p:ctrl>",
        "<p:ctrl><p:autoNum>hidden</p:autoNum></p:ctrl>",
        "<p:ctrl><p:autoNum><p:autoNumFormat>hidden</p:autoNumFormat></p:autoNum></p:ctrl>",
        "<p:ctrl><p:autoNum><p:autoNumFormat/><p:autoNumFormat/></p:autoNum></p:ctrl>",
        "<p:ctrl><p:autoNum><p:unknown/></p:autoNum></p:ctrl>",
        "<p:ctrl><footNote xmlns='urn:foreign'/></p:ctrl>",
        "<p:unknown/>",
    }) |control| {
        const source = try std.mem.concat(a, u8, &.{ prefix, control, suffix });
        defer a.free(source);
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_mod.collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try locations_mod.build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(error.UnsupportedParagraphControl, edit.splice(a, &tree, &sites, locations, 1, 0, 0, "x", 10000));
        try std.testing.expectEqualStrings("A", sites.items[0].text);
    }
}
