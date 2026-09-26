const std = @import("std");
const section_tree = @import("section_tree.zig");
const controls = @import("inline_string_controls.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: controls.Options) !controls.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return controls.inspect(a, &.{tree}, options);
}

test "HWPX inline string controls preserve both control types and direct text" {
    const source = prefix ++
        "<p:indexmark><p:firstKey>A&amp;<![CDATA[<]]></p:firstKey><p:secondKey/></p:indexmark>" ++
        "<p:dutmal posType='TOP' szRatio='0' option='1' styleIDRef='2' align='CENTER'><p:mainText>M&amp;<![CDATA[<]]></p:mainText><p:subText>sub</p:subText></p:dutmal>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.controls.len);
    try std.testing.expectEqual(@as(usize, 4), report.texts.len);
    try std.testing.expectEqual(controls.Kind.indexmark, report.controls[0].kind);
    try std.testing.expectEqual(controls.Kind.dutmal, report.controls[1].kind);
    try std.testing.expectEqualStrings("run", report.controls[0].parent_local_name);
    try std.testing.expectEqualStrings("CENTER", report.controls[1].attributes.alignment.?);
    try std.testing.expectEqualStrings("2", report.controls[1].attributes.style_id_ref.?);
    try std.testing.expectEqualStrings("A&<", report.texts[0].value);
    try std.testing.expectEqualStrings("", report.texts[1].value);
    try std.testing.expectEqualStrings("M&<", report.texts[2].value);
    try std.testing.expectEqualStrings("sub", report.texts[3].value);
    try std.testing.expectEqualStrings("<p:secondKey/>", report.texts[1].raw_xml);
    try std.testing.expectEqual(@as(usize, 0), report.unknown_children);
    try std.testing.expectEqual(@as(usize, 9), report.value_bytes);
}

test "HWPX inline string controls retain unknown source but do not promote it" {
    const source = prefix ++
        "<x:indexmark><x:firstKey>ignored</x:firstKey></x:indexmark>" ++
        "<p:indexmark future='x'>root<x:firstKey>other</x:firstKey><p:mainText>wrong</p:mainText><p:firstKey future='y'>before<x:nested>ignored</x:nested>after</p:firstKey></p:indexmark>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.controls.len);
    try std.testing.expectEqual(@as(usize, 1), report.texts.len);
    try std.testing.expectEqual(@as(usize, 2), report.unknown_children);
    try std.testing.expectEqual(@as(usize, 2), report.other_attributes);
    try std.testing.expectEqualStrings("root", report.controls[0].direct_text);
    try std.testing.expectEqualStrings("beforeafter", report.texts[0].value);
    try std.testing.expectEqual(@as(usize, 1), report.texts[0].direct_children);
    try std.testing.expect(std.mem.indexOf(u8, report.controls[0].raw_xml, "<p:mainText>wrong</p:mainText>") != null);
}

test "HWPX inline string controls reject invalid known dutmal attribute spellings" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidDutmalPosition, inspect(a, prefix ++ "<p:dutmal posType='SIDE'/>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidDutmalAlignment, inspect(a, prefix ++ "<p:dutmal align='center'/>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, prefix ++ "<p:dutmal styleIDRef='4294967296'/>" ++ suffix, .{}));
    var absent = try inspect(a, prefix ++ "<p:dutmal/>" ++ suffix, .{});
    defer absent.deinit();
    try std.testing.expect(absent.controls[0].attributes.style_id_ref == null);
}

test "HWPX inline string controls preserve section order and foreign parent names" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<x:wrap><p:indexmark><p:firstKey>a</p:firstKey></p:indexmark></x:wrap>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:dutmal><p:subText>b</p:subText></p:dutmal>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var report = try controls.inspect(a, &.{ first, second }, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.controls.len);
    try std.testing.expectEqual(@as(usize, 0), report.controls[0].section_ordinal);
    try std.testing.expectEqual(@as(usize, 1), report.controls[1].section_ordinal);
    try std.testing.expectEqualStrings("urn:foreign", report.controls[0].parent_uri);
    try std.testing.expectEqualStrings("wrap", report.controls[0].parent_local_name);
    try std.testing.expectEqual(controls.TextKind.sub_text, report.texts[1].kind);
}

test "HWPX inline string controls decode UTF16 text and parent names" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:indexmark><p:firstKey>&#xAC00;&amp;B</p:firstKey></p:indexmark></p:run></p:p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var report = try inspect(a, raw, .{});
        defer report.deinit();
        try std.testing.expectEqualStrings("가&B", report.texts[0].value);
        try std.testing.expectEqualStrings("run", report.controls[0].parent_local_name);
    }
}

test "HWPX inline string controls enforce count and byte budgets" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:indexmark><p:firstKey>A&amp;B</p:firstKey></p:indexmark><p:dutmal posType='TOP'><p:mainText>x</p:mainText></p:dutmal>" ++ suffix;
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_controls = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_texts = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_name_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_value_bytes = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_controls = 2, .max_texts = 2, .max_value_bytes = 3, .max_owned_bytes = owned });
    exact.deinit();
}

test "HWPX inline string controls release allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, prefix ++ "<p:indexmark><p:firstKey>A&amp;B</p:firstKey></p:indexmark><p:dutmal posType='BOTTOM'><p:mainText>M</p:mainText></p:dutmal>" ++ suffix, .{});
            report.deinit();
        }
    }.run, .{});
}

test "HWPX inline string controls survive source trees and package release" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:indexmark><p:firstKey>key</p:firstKey></p:indexmark><p:dutmal posType='TOP' szRatio='0' option='0' styleIDRef='0' align='CENTER'><p:mainText>A&amp;B</p:mainText><p:subText>sub</p:subText></p:dutmal>" ++ suffix;
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
    var from_trees = try trees.inspectInlineStringControls(a, .{});
    trees.deinit(a);
    var standalone = try document.inspectInlineStringControls(a, .{});
    var known = try document.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .inline_string_controls = .{ .max_controls = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    document.deinit(a);
    a.free(bytes);
    defer from_trees.deinit();
    defer standalone.deinit();
    defer known.deinit(a);
    try std.testing.expectEqualStrings("key", from_trees.texts[0].value);
    try std.testing.expectEqualStrings("A&B", standalone.texts[1].value);
    try std.testing.expectEqualStrings("sub", known.inline_string_controls.texts[2].value);
    try std.testing.expectEqualStrings("CENTER", known.inline_string_controls.controls[1].attributes.alignment.?);
}
