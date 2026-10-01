const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const locations_module = @import("text_site_locations.zig");
const edit = @import("plain_paragraph_edit.zig");

test "HWPX plain paragraph splice spans styled sites and is atomic on surrogate failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'><p:t>한😀</p:t></p:run><p:run charPrIDRef='2'><p:t>끝ABC</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectError(error.SplitSurrogatePair, edit.splice(a, &tree, &sites, locations, 1, 0, 2, "new", 10000));
    try std.testing.expectEqualStrings("한😀", sites.items[0].text);
    try std.testing.expectEqualStrings("끝ABC", sites.items[1].text);
    try std.testing.expect(!try edit.splice(a, &tree, &sites, locations, 1, 1, 3, "😀끝", 10000));
    try std.testing.expectEqualStrings("한😀", sites.items[0].text);
    try std.testing.expectEqualStrings("끝ABC", sites.items[1].text);
    try std.testing.expect(try edit.splice(a, &tree, &sites, locations, 1, 1, 3, "새😀", 10000));
    try std.testing.expectEqualStrings("한새😀", sites.items[0].text);
    try std.testing.expectEqualStrings("ABC", sites.items[1].text);
    const output = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "charPrIDRef='1'") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "charPrIDRef='2'") != null);
}

test "HWPX plain paragraph splice releases every failed draft and preserves all current sites" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:t>BC</p:t><p:t>DEF</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const tree_module.Tree) !void {
            var sites = try sites_module.collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try locations_module.build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = edit.splice(allocator, parsed, &sites, locations, 1, 1, 5, "한😀", 10000) catch |err| {
                try std.testing.expectEqualStrings("A😀", sites.items[0].text);
                try std.testing.expectEqualStrings("BC", sites.items[1].text);
                try std.testing.expectEqualStrings("DEF", sites.items[2].text);
                return err;
            };
            try std.testing.expectEqualStrings("A한😀", sites.items[0].text);
            try std.testing.expectEqualStrings("", sites.items[1].text);
            try std.testing.expectEqualStrings("EF", sites.items[2].text);
        }
    }.run, .{&tree});
}

test "HWPX plain paragraph splice refuses unprojected run controls" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1'/></p:ctrl><p:t>label</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectError(error.UnsupportedParagraphControl, edit.splice(a, &tree, &sites, locations, 1, 0, 0, "new", 10000));
    try std.testing.expectEqualStrings("label", sites.items[0].text);
}
