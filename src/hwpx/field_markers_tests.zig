const std = @import("std");
const section_tree = @import("section_tree.zig");
const markers = @import("field_markers.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

fn inspect(a: std.mem.Allocator, inner: []const u8, options: markers.Options) !markers.Report {
    const source = try std.mem.concat(a, u8, &.{ prefix, inner, suffix });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return markers.inspect(a, &.{tree}, options);
}

test "HWPX field markers preserve lexical fields children and explicit links" {
    var report = try inspect(std.testing.allocator, "<p:ctrl><p:fieldBegin id='0001' type='CLICK_HERE' name='A&amp;B' editable='1' dirty='false' zorder='-2' fieldid='9' metaTag='future'><p:parameters/><p:metaTag/></p:fieldBegin></p:ctrl>" ++
        "<p:ctrl><p:fieldEnd beginIDRef='1' fieldid='9'/></p:ctrl>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.markers.len);
    try std.testing.expectEqual(@as(usize, 1), report.begins);
    try std.testing.expectEqual(@as(usize, 1), report.ends);
    try std.testing.expectEqual(@as(usize, 0), report.unmatched_begins);
    try std.testing.expectEqual(@as(usize, 0), report.unresolved_ends);
    try std.testing.expectEqual(@as(usize, 1), report.other_attributes);
    try std.testing.expectEqualStrings("A&B", report.markers[0].begin.?.name.?);
    try std.testing.expectEqualStrings("0001", report.markers[0].begin.?.id_raw.?);
    try std.testing.expect(report.markers[0].begin.?.type_known.?);
    try std.testing.expect(report.markers[0].begin.?.editable.?);
    try std.testing.expect(!report.markers[0].begin.?.dirty.?);
    try std.testing.expectEqual(@as(i32, -2), report.markers[0].begin.?.zorder.?);
    try std.testing.expectEqual(@as(usize, 2), report.markers[0].direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.markers[0].parameters_children);
    try std.testing.expectEqual(@as(usize, 1), report.markers[0].meta_tag_children);
    try std.testing.expectEqualStrings("ctrl", report.markers[0].parent_local_name);
    try std.testing.expectEqual(@as(?usize, 1), report.markers[0].matched_marker_index);
    try std.testing.expectEqual(@as(?usize, 0), report.markers[1].matched_marker_index);
    try std.testing.expect(std.mem.indexOf(u8, report.markers[0].raw_xml, "metaTag='future'") != null);
}

test "HWPX field markers diagnose missing forward duplicate crossing and fieldid" {
    var report = try inspect(std.testing.allocator, "<p:fieldEnd/>" ++
        "<p:fieldEnd beginIDRef='9'/>" ++
        "<p:fieldEnd beginIDRef='1'/>" ++
        "<p:fieldBegin id='1' type='FUTURE'/>" ++
        "<p:fieldBegin id='2' fieldid='8'/>" ++
        "<p:fieldEnd beginIDRef='1'/>" ++
        "<p:fieldEnd beginIDRef='2' fieldid='7'/>" ++
        "<p:fieldEnd beginIDRef='1'/>" ++
        "<p:fieldBegin id='3'/><p:fieldBegin id='3'/><p:fieldEnd beginIDRef='3'/>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.unknown_types);
    try std.testing.expect(!report.markers[3].begin.?.type_known.?);
    try std.testing.expectEqual(@as(usize, 3), report.missing_types);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_begin_ids);
    try std.testing.expectEqual(@as(usize, 5), report.unresolved_ends);
    try std.testing.expectEqual(@as(usize, 2), report.unmatched_begins);
    try std.testing.expectEqual(@as(usize, 1), report.non_lifo_closures);
    try std.testing.expectEqual(@as(usize, 1), report.fieldid_mismatches);
    try std.testing.expectEqual(@as(?usize, null), report.markers[0].matched_marker_index);
    try std.testing.expect(report.markers[5].non_lifo);
}

test "HWPX field markers do not pair across sections and retain foreign elements" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<x:fieldBegin id='1'/><p:fieldBegin id='1'/><x:wrap><p:fieldBegin id='2'/></x:wrap>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:fieldEnd beginIDRef='1'/>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var report = try markers.inspect(a, &.{ first, second }, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.markers.len);
    try std.testing.expectEqual(@as(usize, 2), report.unmatched_begins);
    try std.testing.expectEqual(@as(usize, 1), report.unresolved_ends);
    try std.testing.expectEqualStrings("urn:foreign", report.markers[1].parent_uri);
}

test "HWPX field markers enforce lexical and ownership budgets" {
    const a = std.testing.allocator;
    const source = "<p:fieldBegin id='1' type='CLICK_HERE'/><p:fieldEnd beginIDRef='1'/>";
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_markers = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_name_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_owned_bytes = owned });
    exact.deinit();
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, "<p:fieldBegin id='4294967296'/>", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(a, "<p:fieldBegin editable='yes'/>", .{}));
}

test "HWPX field markers distinguish missing and empty lexical fields" {
    const a = std.testing.allocator;
    var report = try inspect(a, "<p:fieldBegin name='' type=''/><p:fieldEnd/>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.missing_begin_ids);
    try std.testing.expectEqual(@as(usize, 0), report.missing_types);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_types);
    try std.testing.expectEqualStrings("", report.markers[0].begin.?.name.?);
    try std.testing.expectEqualStrings("", report.markers[0].begin.?.type_raw.?);
    try std.testing.expectEqual(@as(usize, 1), report.unmatched_begins);
    try std.testing.expectEqual(@as(usize, 1), report.unresolved_ends);
    try std.testing.expectEqual(markers.Kind.end, report.markers[1].kind);
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspect(a, "<p:fieldEnd beginIDRef=''/>", .{}));
}

test "HWPX field markers decode UTF16 attributes and preserve raw XML bytes" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?>" ++ prefix ++ "<p:fieldBegin id='1' name='&#xAC00;&amp;B'/><p:fieldEnd beginIDRef='1'/>" ++ suffix;
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var tree = try section_tree.parse(a, raw, 0, 0, .{});
        defer tree.deinit(a);
        var report = try markers.inspect(a, &.{tree}, .{});
        defer report.deinit();
        try std.testing.expectEqualStrings("가&B", report.markers[0].begin.?.name.?);
        try std.testing.expectEqual(@as(?usize, 1), report.markers[0].matched_marker_index);
        try std.testing.expect(report.markers[0].raw_xml.len > 8);
    }
}

test "HWPX field markers release allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, "<p:fieldBegin id='1' name='A&amp;B'><p:parameters/></p:fieldBegin><p:fieldEnd beginIDRef='1'/>", .{});
            report.deinit();
        }
    }.run, .{});
}

test "HWPX field markers survive tree and package release" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' name='a'><p:parameters/></p:fieldBegin></p:ctrl><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>" ++ suffix;
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
    var tree_report = try trees.inspectFieldMarkers(a, .{});
    trees.deinit(a);
    var direct_report = try document.inspectFieldMarkers(a, .{});
    var known = try document.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .field_markers = .{ .max_markers = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    document.deinit(a);
    a.free(bytes);
    defer tree_report.deinit();
    defer direct_report.deinit();
    defer known.deinit(a);
    try std.testing.expectEqualStrings("a", tree_report.markers[0].begin.?.name.?);
    try std.testing.expectEqual(@as(usize, 0), direct_report.unresolved_ends);
    try std.testing.expectEqual(@as(?usize, 1), known.field_markers.markers[0].matched_marker_index);
}
