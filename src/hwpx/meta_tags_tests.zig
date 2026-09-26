const std = @import("std");
const section_tree = @import("section_tree.zig");
const meta_tags = @import("meta_tags.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: meta_tags.Options) !meta_tags.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return meta_tags.inspect(a, &.{tree}, options);
}

test "HWPX meta tags own direct normalized text and exact source" {
    const source = prefix ++ "<p:fieldBegin><p:metaTag>A&amp;<![CDATA[<]]>&#xAC00;</p:metaTag><p:metaTag future='x'>tail<x:nested>ignored</x:nested>after</p:metaTag><p:metaTag/></p:fieldBegin>" ++
        "<x:metaTag>foreign</x:metaTag><p:equation><p:metaTag>equation</p:metaTag></p:equation>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 4), report.tags.len);
    try std.testing.expectEqualStrings("A&<가", report.tags[0].value);
    try std.testing.expectEqualStrings("tailafter", report.tags[1].value);
    try std.testing.expectEqualStrings("", report.tags[2].value);
    try std.testing.expectEqualStrings("equation", report.tags[3].value);
    try std.testing.expectEqualStrings("fieldBegin", report.tags[0].parent_local_name);
    try std.testing.expectEqualStrings("equation", report.tags[3].parent_local_name);
    try std.testing.expectEqualStrings("http://www.hancom.co.kr/hwpml/2011/paragraph", report.tags[0].parent_uri);
    try std.testing.expectEqualStrings("<p:metaTag>A&amp;<![CDATA[<]]>&#xAC00;</p:metaTag>", report.tags[0].raw_xml);
    try std.testing.expectEqual(@as(usize, 1), report.direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.other_attributes);
    try std.testing.expectEqual(@as(usize, 23), report.value_bytes);
}

test "HWPX meta tags preserve foreign parent and section order" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<x:fieldBegin><p:metaTag>x</p:metaTag></x:fieldBegin>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:fieldBegin><p:metaTag>y</p:metaTag></p:fieldBegin>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var report = try meta_tags.inspect(a, &.{ first, second }, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.tags.len);
    try std.testing.expectEqualStrings("urn:foreign", report.tags[0].parent_uri);
    try std.testing.expectEqualStrings("fieldBegin", report.tags[0].parent_local_name);
    try std.testing.expectEqual(@as(usize, 1), report.tags[1].section_ordinal);
}

test "HWPX meta tags enforce count text and shared byte limits" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:fieldBegin><p:metaTag>A&amp;B</p:metaTag><p:metaTag>xy</p:metaTag></p:fieldBegin>" ++ suffix;
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_tags = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_name_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_value_bytes = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_tags = 2, .max_value_bytes = 3, .max_owned_bytes = owned });
    exact.deinit();
}

test "HWPX meta tags decode UTF16 and retain parent names" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:fieldBegin><p:metaTag>&#xAC00;&amp;B</p:metaTag></p:fieldBegin></p:run></p:p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var report = try inspect(a, raw, .{});
        defer report.deinit();
        try std.testing.expectEqualStrings("가&B", report.tags[0].value);
        try std.testing.expectEqualStrings("fieldBegin", report.tags[0].parent_local_name);
    }
}

test "HWPX meta tags survive package and known inspection release" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:fieldBegin><p:metaTag>A&amp;B</p:metaTag></p:fieldBegin>" ++ suffix;
    const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList/></h:head>" },
        .{ .name = "Contents/section0.xml", .data = section },
    };
    const bytes = try fixture.storedZip(a, &sources);
    var document = try package.inspectDocument(a, bytes, .{});
    var trees = try document.readXmlTrees(a, .{});
    var from_trees = try trees.inspectMetaTags(a, .{});
    trees.deinit(a);
    var standalone = try document.inspectMetaTags(a, .{});
    var known = try document.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .meta_tags = .{ .max_tags = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    document.deinit(a);
    a.free(bytes);
    defer from_trees.deinit();
    defer standalone.deinit();
    defer known.deinit(a);
    try std.testing.expectEqualStrings("A&B", from_trees.tags[0].value);
    try std.testing.expectEqualStrings("A&B", standalone.tags[0].value);
    try std.testing.expectEqualStrings("A&B", known.meta_tags.tags[0].value);
}

test "HWPX meta tags release all allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, prefix ++ "<p:fieldBegin><p:metaTag>A&amp;<![CDATA[B]]></p:metaTag></p:fieldBegin>" ++ suffix, .{});
            report.deinit();
        }
    }.run, .{});
}
