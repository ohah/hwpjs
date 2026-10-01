const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const locations_mod = @import("text_site_locations.zig");
const edit = @import("anchor_paragraph_edit.zig");
const save = @import("text_sites_save.zig");

const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:pic/><p:line/></p:run></p:p></s:sec>";
const options: sites_mod.Options = .{ .materialize_anchor_boundaries = true };

test "HWPX run text boundaries allocation failures preserve transaction" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var sites = try sites_mod.collect(allocator, parsed, options);
            defer sites.deinit(allocator);
            const locations = try locations_mod.build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = edit.splice(allocator, parsed, &sites, locations, 1, 1, 0, "한😀", 10000) catch |err| {
                for (sites.items) |site| try std.testing.expectEqualStrings("", site.text);
                return err;
            };
            const saved = try save.write(allocator, parsed, &sites, options, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:pic/><p:t>한😀</p:t><p:line/>") != null);
            try std.testing.expectEqualStrings(source, parsed.source);
        }
    }.run, .{&tree});
}

test "HWPX run text boundaries insert before between after objects and restore source" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    for (0..3) |position| {
        var sites = try sites_mod.collect(a, &tree, options);
        defer sites.deinit(a);
        try std.testing.expectEqual(@as(usize, 3), sites.items.len);
        const locations = try locations_mod.build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(error.ProtectedInlineControl, edit.splice(a, &tree, &sites, locations, 1, 0, 1, "", 10000));
        _ = try edit.splice(a, &tree, &sites, locations, 1, @intCast(position), 0, "앞😀<&", 10000);
        const text = try edit.text(a, &tree, &sites, locations, 1, 10000);
        defer a.free(text);
        const expected = [_][]const u8{ "앞😀<&\xef\xbf\xbc\xef\xbf\xbc", "\xef\xbf\xbc앞😀<&\xef\xbf\xbc", "\xef\xbf\xbc\xef\xbf\xbc앞😀<&" };
        try std.testing.expectEqualStrings(expected[position], text);
        const saved = try save.write(a, &tree, &sites, options, 10000);
        defer a.free(saved);
        const fragments = [_][]const u8{ "<p:t>앞😀&lt;&amp;</p:t><p:pic/><p:line/>", "<p:pic/><p:t>앞😀&lt;&amp;</p:t><p:line/>", "<p:pic/><p:line/><p:t>앞😀&lt;&amp;</p:t>" };
        try std.testing.expect(std.mem.indexOf(u8, saved, fragments[position]) != null);
        _ = try edit.splice(a, &tree, &sites, locations, 1, @intCast(position), 5, "", 10000);
        const restored = try save.write(a, &tree, &sites, options, 10000);
        defer a.free(restored);
        try std.testing.expectEqualStrings(source, restored);
    }
}
