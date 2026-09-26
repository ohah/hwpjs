const std = @import("std");
const section_tree = @import("section_tree.zig");
const columns = @import("column_definitions.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

fn inspect(a: std.mem.Allocator, inner: []const u8, options: columns.Options) !columns.Report {
    const source = try std.mem.concat(a, u8, &.{ prefix, inner, suffix });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return columns.inspect(a, &.{tree}, options);
}

test "HWPX column definitions preserve unequal widths order and original values" {
    var report = try inspect(std.testing.allocator, "<p:ctrl><p:colPr id='' type='NORMAL' layout='LEFT' colCount='02' sameSz='0' sameGap='0' future='x'>" ++
        "<p:colLine type='SOLID' width=' 0.12   mm ' color='#000000'/>" ++
        "<p:colSz width='123' gap='4'/><p:colSz width='456' gap='0'/>" ++
        "</p:colPr></p:ctrl>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.columns.len);
    try std.testing.expectEqual(@as(usize, 3), report.children.len);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_types);
    try std.testing.expectEqual(@as(usize, 1), report.unequal_columns);
    try std.testing.expectEqual(@as(usize, 0), report.size_count_mismatches);
    try std.testing.expectEqual(@as(usize, 1), report.other_attributes);
    try std.testing.expectEqualStrings("ctrl", report.columns[0].parent_local_name);
    try std.testing.expectEqualStrings("02", report.columns[0].attributes.get(.col_count).?);
    try std.testing.expectEqual(@as(?u32, 2), report.columns[0].attributes.col_count);
    try std.testing.expectEqual(@as(?bool, false), report.columns[0].attributes.same_sz);
    try std.testing.expectEqual(@as(usize, 2), report.columns[0].size_children);
    try std.testing.expectEqual(columns.ChildKind.line, report.children[0].kind);
    try std.testing.expect(report.children[0].line.?.width_known.?);
    try std.testing.expectEqual(@as(?u32, 123), report.children[1].size.?.width);
    try std.testing.expectEqual(@as(?u32, 4), report.children[1].size.?.gap);
    try std.testing.expectEqual(@as(?u32, 456), report.children[2].size.?.width);
    try std.testing.expect(std.mem.indexOf(u8, report.columns[0].raw_xml, "future='x'") != null);
}

test "HWPX column definitions preserve unknown children and diagnostic mismatches" {
    var report = try inspect(std.testing.allocator, "<x:colPr colCount='1'/>" ++
        "<p:colPr type='NEWSPAPER' sameSz='false' colCount='3'><x:colSz width='10'/><p:colSz width='1' gap='2'><p:future/></p:colSz><p:colLine type='FUTURE' width='4 mm' color='bad'/></p:colPr>" ++
        "<p:colPr sameSz='true' colCount='1'><p:colSz width='9'/></p:colPr>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.columns.len);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_children);
    try std.testing.expectEqual(@as(usize, 1), report.size_count_mismatches);
    try std.testing.expectEqual(@as(usize, 1), report.uniform_size_children);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_line_types);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_line_widths);
    try std.testing.expectEqual(@as(usize, 1), report.noncanonical_colors);
    try std.testing.expectEqual(@as(usize, 1), report.leaf_children);
    try std.testing.expectEqual(@as(usize, 1), report.children[0].direct_children);
    try std.testing.expectEqual(@as(usize, 3), report.columns[0].direct_children);
}

test "HWPX column definitions keep absent fields separate from empty values" {
    var report = try inspect(std.testing.allocator, "<p:colPr id='' type='' layout=''/><p:colPr/>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.columns.len);
    try std.testing.expectEqualStrings("", report.columns[0].attributes.get(.id).?);
    try std.testing.expectEqualStrings("", report.columns[0].attributes.get(.type).?);
    try std.testing.expect(report.columns[1].attributes.get(.id) == null);
    try std.testing.expect(report.columns[1].attributes.type_known == null);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_types);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_layouts);
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspect(std.testing.allocator, "<p:colPr colCount='' />", .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspect(std.testing.allocator, "<p:colPr sameGap='4294967296' />", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(std.testing.allocator, "<p:colPr sameSz='yes' />", .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspect(std.testing.allocator, "<p:colPr><p:colSz width='4294967296'/></p:colPr>", .{}));
}

test "HWPX column definitions preserve section order and foreign parent" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<x:wrap><p:colPr type='NEWSPAPER'/></x:wrap>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:colPr type='PARALLEL'/>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var report = try columns.inspect(a, &.{ first, second }, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.columns.len);
    try std.testing.expectEqual(@as(usize, 0), report.columns[0].section_ordinal);
    try std.testing.expectEqual(@as(usize, 1), report.columns[1].section_ordinal);
    try std.testing.expectEqualStrings("urn:foreign", report.columns[0].parent_uri);
    try std.testing.expectEqualStrings("wrap", report.columns[0].parent_local_name);
    try std.testing.expectEqual(@as(usize, 0), report.unknown_types);
}

test "HWPX column definitions enforce byte and count budgets" {
    const a = std.testing.allocator;
    const source = "<p:colPr colCount='2' sameSz='0'><p:colSz width='1'/><p:colSz width='2'/></p:colPr>";
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_columns = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_children = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_direct_children = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_name_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_owned_bytes = owned });
    exact.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, "<p:colPr><p:colSz><p:future/></p:colSz></p:colPr>", .{ .max_leaf_children = 0 }));
}

test "HWPX column definitions release all allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, "<p:colPr type='NEWSPAPER' colCount='2' sameSz='0'><p:colLine type='SOLID' width='0.12 mm'/><p:colSz width='1' gap='0'/><p:colSz width='2' gap='0'/></p:colPr>", .{});
            report.deinit();
        }
    }.run, .{});
}

test "HWPX column definitions survive package and source tree release" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:ctrl><p:colPr type='NORMAL' colCount='2' sameSz='false'><p:colSz width='11'/><p:colSz width='22'/></p:colPr></p:ctrl>" ++ suffix;
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
    var tree_report = try trees.inspectColumnDefinitions(a, .{});
    trees.deinit(a);
    var direct_report = try document.inspectColumnDefinitions(a, .{});
    var known = try document.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .column_definitions = .{ .max_columns = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    document.deinit(a);
    a.free(bytes);
    defer tree_report.deinit();
    defer direct_report.deinit();
    defer known.deinit(a);
    try std.testing.expectEqualStrings("NORMAL", tree_report.columns[0].attributes.get(.type).?);
    try std.testing.expectEqual(@as(usize, 2), direct_report.children.len);
    try std.testing.expectEqual(@as(usize, 1), known.column_definitions.unknown_types);
}
