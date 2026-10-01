const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const locations_module = @import("text_site_locations.zig");
const edit = @import("plain_paragraph_edit.zig");

test "HWPX plain paragraph tab site creation refuses UTF16 output mixing" {
    const a = std.testing.allocator;
    const ascii = "<?xml version='1.0' encoding='UTF-16'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><p:tab/></p:t></p:run></p:p></s:sec>";
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var tree = try tree_module.parse(a, raw, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedEditEncoding, sites_module.collect(a, &tree, .{ .materialize_tab_boundaries = true }));
        try std.testing.expectEqualSlices(u8, raw, tree.source);
    }
}

test "HWPX plain paragraph refuses text hidden inside paired tab elements" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A<p:tab>hidden</p:tab>B</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{ .materialize_tab_boundaries = true });
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectError(error.UnsupportedInlineControl, edit.spliceWithTabs(a, &tree, &sites, locations, 1, 0, 0, "new", 10000, true));
}

test "HWPX plain paragraph tab-only boundaries support insert restore and allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><!--keep--><p:tab width='100'/><p:tab width='200'/></p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, sites_module.collect(a, &tree, .{ .materialize_tab_boundaries = true, .max_sites = 2 }));
    var bounded = try sites_module.collect(a, &tree, .{ .materialize_tab_boundaries = true, .max_sites = 3, .max_text_bytes = 0 });
    defer bounded.deinit(a);
    const bounded_locations = try locations_module.build(a, &tree, &bounded, .{});
    defer a.free(bounded_locations);
    try std.testing.expectError(error.LimitExceeded, edit.spliceWithTabs(a, &tree, &bounded, bounded_locations, 1, 1, 0, "x", 0, true));
    for (bounded.items) |site| try std.testing.expectEqualStrings("", site.text);
    try std.testing.expect(!try edit.spliceWithTabs(a, &tree, &bounded, bounded_locations, 1, 1, 0, "", 0, true));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const tree_module.Tree) !void {
            const options: sites_module.Options = .{ .materialize_tab_boundaries = true };
            var sites = try sites_module.collect(allocator, parsed, options);
            defer sites.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), sites.items.len);
            const locations = try locations_module.build(allocator, parsed, &sites, options);
            defer allocator.free(locations);
            _ = edit.spliceWithTabs(allocator, parsed, &sites, locations, 1, 1, 0, "한😀", 10000, true) catch |err| {
                for (sites.items) |site| try std.testing.expectEqualStrings("", site.text);
                return err;
            };
            try std.testing.expectEqualStrings("한😀", sites.items[1].text);
            const output = try @import("text_sites_save.zig").write(allocator, parsed, &sites, options, 10000);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "<p:tab width='100'/>한😀<p:tab width='200'/>") != null);
            _ = try edit.spliceWithTabs(allocator, parsed, &sites, locations, 1, 1, 3, "", 10000, true);
            const restored = try @import("text_sites_save.zig").write(allocator, parsed, &sites, options, 10000);
            defer allocator.free(restored);
            try std.testing.expectEqualSlices(u8, parsed.source, restored);
        }
    }.run, .{&tree});
}

test "HWPX plain paragraph tab-aware splice edits both sides and preserves inline source" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A<p:tab width='100'/>B😀</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expect(try edit.spliceWithTabs(a, &tree, &sites, locations, 1, 2, 1, "한", 10000, true));
    try std.testing.expectEqualStrings("A", sites.items[0].text);
    try std.testing.expectEqualStrings("한😀", sites.items[1].text);
    try std.testing.expectError(error.ProtectedInlineControl, edit.spliceWithTabs(a, &tree, &sites, locations, 1, 1, 1, "", 10000, true));
    try std.testing.expectError(error.SplitSurrogatePair, edit.spliceWithTabs(a, &tree, &sites, locations, 1, 4, 0, "x", 10000, true));
    const output = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "A<p:tab width='100'/>한😀") != null);
}

test "HWPX plain paragraph column metadata does not authorize mixed or nested controls" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl>";
    const suffix = "</p:ctrl><p:t>본문</p:t></p:run></p:p></s:sec>";
    for ([_][]const u8{
        "<p:colPr/><p:fieldBegin id='1'/>",
        "<p:colPr><p:t>hidden</p:t></p:colPr>",
        "<p:colPr><p:colSz><p:t>hidden</p:t></p:colSz></p:colPr>",
        "<p:colPr><p:unknown/></p:colPr>",
        "<colPr xmlns='urn:foreign'/>",
        "",
    }) |control| {
        const source = try std.mem.concat(a, u8, &.{ prefix, control, suffix });
        defer a.free(source);
        var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_module.collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try locations_module.build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(error.UnsupportedParagraphControl, edit.splice(a, &tree, &sites, locations, 1, 0, 0, "new", 10000));
        const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, source, saved);
    }
}

test "HWPX plain paragraph preserves column configuration while editing adjacent text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr type='NEWSPAPER' colCount='2'><p:colSz width='100'/></p:colPr></p:ctrl><p:t>본문</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expect(try edit.splice(a, &tree, &sites, locations, 1, 0, 0, "새", 10000));
    const output = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:ctrl><p:colPr type='NEWSPAPER' colCount='2'><p:colSz width='100'/></p:colPr></p:ctrl>") != null);
    try std.testing.expectEqualStrings("새본문", sites.items[0].text);
}

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
