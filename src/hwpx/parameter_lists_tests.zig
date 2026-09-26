const std = @import("std");
const section_tree = @import("section_tree.zig");
const parameter_lists = @import("parameter_lists.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: parameter_lists.Options) !parameter_lists.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return parameter_lists.inspect(a, &.{tree}, options);
}

test "HWPX parameter lists preserve recursive node order attributes and direct text" {
    const source = prefix ++ "<p:pic><p:parameterset cnt='2' name=''><p:listParam cnt='1' name='group'><p:stringParam name='a'>A&amp;<![CDATA[<]]>&#xAC00;</p:stringParam></p:listParam><p:integerParam name='n'>+01</p:integerParam></p:parameterset></p:pic>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.roots.len);
    try std.testing.expectEqual(parameter_lists.Owner.picture, report.roots[0].owner);
    try std.testing.expectEqualStrings("pic", report.roots[0].parent_local_name);
    try std.testing.expectEqualStrings("http://www.hancom.co.kr/hwpml/2011/paragraph", report.roots[0].parent_uri);
    try std.testing.expectEqual(@as(usize, 4), report.nodes.len);
    try std.testing.expectEqual(@as(usize, 4), report.roots[0].node_count);
    try std.testing.expectEqual(parameter_lists.Kind.parameter_set, report.nodes[0].kind);
    try std.testing.expectEqual(parameter_lists.Kind.list, report.nodes[1].kind);
    try std.testing.expectEqual(parameter_lists.Kind.string, report.nodes[2].kind);
    try std.testing.expectEqual(parameter_lists.Kind.integer, report.nodes[3].kind);
    try std.testing.expectEqual(@as(?usize, 0), report.nodes[1].parent_node_index);
    try std.testing.expectEqual(@as(?usize, 1), report.nodes[2].parent_node_index);
    try std.testing.expectEqual(@as(?usize, 0), report.nodes[3].parent_node_index);
    try std.testing.expectEqualStrings("", report.nodes[0].name.?);
    try std.testing.expectEqualStrings("2", report.nodes[0].cnt.?);
    try std.testing.expectEqualStrings("A&<가", report.nodes[2].value.?);
    try std.testing.expectEqualStrings("+01", report.nodes[3].value.?);
    try std.testing.expectEqualStrings("<p:stringParam name='a'>A&amp;<![CDATA[<]]>&#xAC00;</p:stringParam>", report.nodes[2].raw_xml);
    try std.testing.expectEqual(@as(usize, 0), report.count_mismatches);
    try std.testing.expectEqual(@as(usize, 9), report.value_bytes);
    try std.testing.expect(std.mem.indexOf(u8, report.roots[0].raw_xml, "<![CDATA[<]]>") != null);
}

test "HWPX parameter lists preserve fieldBegin parameters in section order" {
    const source = prefix ++
        "<p:fieldBegin><p:parameters cnt='3' name=''><p:stringParam name='s'>A&amp;<![CDATA[<]]></p:stringParam><p:integerParam name='i'>-01</p:integerParam><p:booleanParam name='b'>FALSE</p:booleanParam></p:parameters></p:fieldBegin>" ++
        "<p:pic><p:parameterset cnt='0'/></p:pic>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.roots.len);
    try std.testing.expectEqual(@as(usize, 5), report.nodes.len);
    try std.testing.expectEqual(parameter_lists.Owner.other, report.roots[0].owner);
    try std.testing.expectEqualStrings("fieldBegin", report.roots[0].parent_local_name);
    try std.testing.expectEqual(parameter_lists.Kind.parameters, report.nodes[0].kind);
    try std.testing.expectEqual(@as(usize, 4), report.roots[0].node_count);
    try std.testing.expectEqual(parameter_lists.Kind.parameter_set, report.nodes[4].kind);
    try std.testing.expectEqualStrings("A&<", report.nodes[1].value.?);
    try std.testing.expectEqualStrings("-01", report.nodes[2].value.?);
    try std.testing.expectEqualStrings("FALSE", report.nodes[3].value.?);
    try std.testing.expectEqualStrings("", report.nodes[0].name.?);
    try std.testing.expectEqual(@as(usize, 0), report.count_mismatches);
    try std.testing.expectEqual(@as(usize, 11), report.value_bytes);
}

test "HWPX parameter lists field roots keep namespace unknown children and count mismatch" {
    const source = prefix ++
        "<x:parameters cnt='0'><x:stringParam>ignored</x:stringParam></x:parameters>" ++
        "<p:fieldBegin><p:parameters cnt='1'><p:stringParam>A</p:stringParam><x:stringParam>B</x:stringParam><p:parameters cnt='0'/></p:parameters></p:fieldBegin>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.nodes.len);
    try std.testing.expectEqual(@as(usize, 1), report.roots.len);
    try std.testing.expectEqual(@as(usize, 2), report.unknown_children);
    try std.testing.expectEqual(@as(usize, 1), report.count_mismatches);
    try std.testing.expectEqualStrings("A", report.nodes[1].value.?);
    try std.testing.expectError(error.InvalidUnsigned32, inspect(std.testing.allocator, prefix ++ "<p:fieldBegin><p:parameters cnt='4294967296'/></p:fieldBegin>" ++ suffix, .{}));
}

test "HWPX parameter lists exclude foreign roots and preserve section order" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<x:parameterset cnt='1'><x:stringParam>foreign</x:stringParam></x:parameterset><p:parameterset cnt='0'/><x:pic><p:parameterset cnt='0'/></x:pic>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:pic><p:parameterset cnt='0'/></p:pic>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var report = try parameter_lists.inspect(a, &.{ first, second }, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.roots.len);
    try std.testing.expectEqual(@as(usize, 0), report.roots[0].section_ordinal);
    try std.testing.expectEqual(@as(usize, 0), report.roots[1].section_ordinal);
    try std.testing.expectEqual(@as(usize, 1), report.roots[2].section_ordinal);
    try std.testing.expectEqual(parameter_lists.Owner.other, report.roots[0].owner);
    try std.testing.expectEqualStrings("run", report.roots[0].parent_local_name);
    try std.testing.expectEqual(parameter_lists.Owner.other, report.roots[1].owner);
    try std.testing.expectEqualStrings("urn:foreign", report.roots[1].parent_uri);
    try std.testing.expectEqualStrings("pic", report.roots[1].parent_local_name);
    try std.testing.expectEqual(parameter_lists.Owner.picture, report.roots[2].owner);
}

test "HWPX parameter lists retain unknown children and count mismatches" {
    const source = prefix ++ "<p:equation><p:parameterset cnt='3'><p:booleanParam name='b'>true</p:booleanParam><x:stringParam name='x'>other</x:stringParam><p:arrayParam cnt='0' name='arr'><p:stringParam>v</p:stringParam></p:arrayParam></p:parameterset></p:equation>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(parameter_lists.Owner.equation, report.roots[0].owner);
    try std.testing.expectEqual(@as(usize, 4), report.nodes.len);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_children);
    try std.testing.expectEqual(@as(usize, 1), report.count_mismatches);
    try std.testing.expectEqual(@as(usize, 1), report.nodes[0].unknown_children);
    try std.testing.expectEqualStrings("v", report.nodes[3].value.?);
}

test "HWPX parameter lists retain every modeled scalar kind without inventing scalar validation" {
    const source = prefix ++ "<p:parameterset cnt='6'>" ++
        "<p:booleanParam name='b'>FALSE</p:booleanParam>" ++
        "<p:integerParam name='i'>-01</p:integerParam>" ++
        "<p:unsignedintegerParam name='u'>4294967296</p:unsignedintegerParam>" ++
        "<p:bindataParam name='d'>missing-id</p:bindataParam>" ++
        "<p:floatParam name='f'>NaN?</p:floatParam>" ++
        "<p:stringParam cnt='not-a-count' name='s'/>" ++
        "</p:parameterset>" ++ suffix;
    var report = try inspect(std.testing.allocator, source, .{});
    defer report.deinit();
    const expected = [_]parameter_lists.Kind{ .boolean, .integer, .unsigned_integer, .bindata, .float, .string };
    for (report.nodes[1..], expected) |node, kind| try std.testing.expectEqual(kind, node.kind);
    try std.testing.expectEqualStrings("4294967296", report.nodes[3].value.?);
    try std.testing.expectEqualStrings("NaN?", report.nodes[5].value.?);
    try std.testing.expectEqualStrings("", report.nodes[6].value.?);
    try std.testing.expectEqualStrings("not-a-count", report.nodes[6].cnt.?);
    try std.testing.expectEqual(@as(usize, 0), report.count_mismatches);
    try std.testing.expectError(error.InvalidUnsigned32, inspect(std.testing.allocator, prefix ++ "<p:parameterset cnt='4294967296'/>" ++ suffix, .{}));
}

test "HWPX parameter lists enforce node depth attribute value and owned byte limits" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:container><p:parameterset cnt='1' name='x'><p:listParam cnt='1' name='y'><p:stringParam name='z'>ab&amp;c</p:stringParam></p:listParam></p:parameterset></p:container>" ++ suffix;
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_roots = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_nodes = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_depth = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_value_bytes = 3 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_nodes = 3, .max_depth = 2, .max_value_bytes = 4, .max_owned_bytes = owned });
    exact.deinit();
}

test "HWPX parameter lists release all allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, prefix ++ "<p:pic><p:parameterset cnt='1'><p:stringParam name='a'>A&amp;B</p:stringParam></p:parameterset></p:pic><p:fieldBegin><p:parameters cnt='1'><p:integerParam name='i'>-01</p:integerParam></p:parameters></p:fieldBegin>" ++ suffix, .{});
            report.deinit();
        }
    }.run, .{});
}

test "HWPX parameter lists survive package and source tree release" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:pic><p:parameterset cnt='1'><p:stringParam name='a'>A&amp;B</p:stringParam></p:parameterset></p:pic><p:fieldBegin><p:parameters cnt='1'><p:integerParam name='i'>-01</p:integerParam></p:parameters></p:fieldBegin>" ++ suffix;
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
    var from_trees = try trees.inspectParameterLists(a, .{});
    trees.deinit(a);
    var standalone = try document.inspectParameterLists(a, .{});
    var known = try document.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .parameter_lists = .{ .max_nodes = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    document.deinit(a);
    a.free(bytes);
    defer from_trees.deinit();
    defer standalone.deinit();
    defer known.deinit(a);
    try std.testing.expectEqualStrings("A&B", from_trees.nodes[1].value.?);
    try std.testing.expectEqualStrings("A&B", standalone.nodes[1].value.?);
    try std.testing.expectEqualStrings("pic", standalone.roots[0].parent_local_name);
    try std.testing.expectEqualStrings("A&B", known.parameter_lists.nodes[1].value.?);
    try std.testing.expectEqualStrings("-01", from_trees.nodes[3].value.?);
    try std.testing.expectEqualStrings("-01", standalone.nodes[3].value.?);
    try std.testing.expectEqualStrings("-01", known.parameter_lists.nodes[3].value.?);
    try std.testing.expectEqual(parameter_lists.Kind.parameters, standalone.nodes[2].kind);
    try std.testing.expectEqualStrings(from_trees.roots[0].raw_xml, standalone.roots[0].raw_xml);
}

test "HWPX parameter lists preserve UTF16 source and normalized value" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:parameterset cnt='1'><p:stringParam name='n'>&#xAC00;</p:stringParam></p:parameterset><p:fieldBegin><p:parameters cnt='1'><p:stringParam name='m'>&#xAC00;</p:stringParam></p:parameters></p:fieldBegin></p:run></p:p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var report = try inspect(a, raw, .{});
        defer report.deinit();
        try std.testing.expectEqualStrings("가", report.nodes[1].value.?);
        try std.testing.expectEqualStrings("가", report.nodes[3].value.?);
        try std.testing.expectEqual(parameter_lists.Kind.parameters, report.nodes[2].kind);
        try std.testing.expectEqualStrings("run", report.roots[0].parent_local_name);
        try std.testing.expect(report.roots[0].raw_xml.len > ascii.len / 4);
    }
}
