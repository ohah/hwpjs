const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const locations_mod = @import("text_site_locations.zig");
const edit = @import("plain_paragraph_edit.zig");

test "HWPX header footer edit keeps three paragraph owners through allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:ctrl><p:header id='1'><p:subList><p:p><p:run><p:t>HEAD</p:t></p:run></p:p></p:subList></p:header></p:ctrl><p:ctrl><p:footer id='2'><p:subList><p:p><p:run><p:t>FOOT</p:t></p:run></p:p></p:subList></p:footer></p:ctrl><p:t>BC</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var sites = try sites_mod.collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try locations_mod.build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = edit.splice(allocator, parsed, &sites, locations, 1, 4, 1, "뒤😀", 10000) catch |err| {
                try std.testing.expectEqualStrings("A😀", sites.items[0].text);
                try std.testing.expectEqualStrings("HEAD", sites.items[1].text);
                try std.testing.expectEqualStrings("FOOT", sites.items[2].text);
                try std.testing.expectEqualStrings("BC", sites.items[3].text);
                return err;
            };
            try std.testing.expectEqualStrings("HEAD", sites.items[1].text);
            try std.testing.expectEqualStrings("FOOT", sites.items[2].text);
            try std.testing.expectEqualStrings("B뒤😀", sites.items[3].text);
            _ = try edit.splice(allocator, parsed, &sites, locations, 2, 0, 1, "h", 10000);
            _ = try edit.splice(allocator, parsed, &sites, locations, 3, 0, 1, "f", 10000);
            try std.testing.expectEqualStrings("hEAD", sites.items[1].text);
            try std.testing.expectEqualStrings("fOOT", sites.items[2].text);
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:header id='1'><p:subList><p:p><p:run><p:t>hEAD</p:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:footer id='2'><p:subList><p:p><p:run><p:t>fOOT</p:t>") != null);
        }
    }.run, .{&tree});
}

test "HWPX header footer edit refuses hidden gaps and ambiguous ownership" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:header/>",
        "<p:header>hidden<p:subList/></p:header>",
        "<p:header><p:subList/><p:subList/></p:header>",
        "<p:header><p:subList>hidden</p:subList></p:header>",
        "<p:header><p:subList><p:t>hidden</p:t></p:subList></p:header>",
        "<p:footer><subList xmlns='urn:foreign'/></p:footer>",
        "<p:footer><p:subList><p:unknown/></p:subList></p:footer>",
    }) |area| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl>", area, "</p:ctrl><p:t>BODY</p:t></p:run></p:p></s:sec>" });
        defer a.free(source);
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_mod.collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try locations_mod.build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(error.UnsupportedParagraphControl, edit.splice(a, &tree, &sites, locations, 1, 0, 0, "X", 10000));
    }
}
