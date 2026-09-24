const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const chart_ns = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";
const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='ole1' href='BinData/ole1.bin' media-type='application/octet-stream' isEmbeded='1'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const chart = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'/>";

fn zipFor(a: std.mem.Allocator, section: []const u8) ![]u8 {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "Chart/chart1.xml", .data = chart },
        .{ .name = "Chart/chart2.xml", .data = chart },
        .{ .name = "BinData/ole1.bin", .data = "ole" },
    };
    return fixture.storedZip(a, &sources);
}

test "HWPX selected references choose chart case or OLE default from one capability set" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch>" ++
        "<p:case p:required-namespace='" ++ chart_ns ++ "'><p:chart chartIDRef='Chart/chart1.xml'/></p:case>" ++
        "<p:default><p:ole binaryItemIDRef='ole1'/></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var raw_chart = try document.inspectChartReferences(a, .{});
    defer raw_chart.deinit(a);
    var raw_binary = try document.inspectBinaryReferences(a, .{});
    defer raw_binary.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), raw_chart.chart_sites);
    try std.testing.expectEqual(@as(usize, 1), raw_binary.counts(.section_ole).sites);

    var fallback = try document.inspectSelectedReferences(a, .{});
    defer fallback.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), fallback.chart.chart_sites);
    try std.testing.expectEqual(@as(usize, 0), fallback.chart.chart_parts);
    try std.testing.expectEqual(@as(usize, 1), fallback.binary.counts(.section_ole).resolved_embedded);
    var case_report = try document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{chart_ns} });
    defer case_report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), case_report.chart.resolved);
    try std.testing.expectEqual(@as(usize, 1), case_report.chart.chart_parts);
    try std.testing.expectEqual(@as(usize, 0), case_report.binary.counts(.section_ole).sites);
}

test "HWPX selected references require every token and retain first eligible branch" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch>" ++
        "<p:case p:required-namespace='" ++ chart_ns ++ " urn:extra'><p:chart chartIDRef='Chart/missing.xml'/></p:case>" ++
        "<p:case p:required-namespace='" ++ chart_ns ++ "'><p:chart chartIDRef='Chart/chart2.xml'/></p:case>" ++
        "<p:default><p:ole binaryItemIDRef='ole1'/></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var one = try document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{chart_ns} });
    defer one.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), one.chart.chart_sites);
    try std.testing.expectEqual(@as(usize, 1), one.chart.resolved);
    try std.testing.expectEqual(@as(usize, 0), one.chart.missing_entry);
    try std.testing.expectEqual(@as(usize, 0), one.binary.counts(.section_ole).sites);
    var both = try document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{ chart_ns, "urn:extra" } });
    defer both.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), both.chart.chart_sites);
    try std.testing.expectEqual(@as(usize, 0), both.chart.chart_parts);
    try std.testing.expectEqual(@as(usize, 1), both.chart.missing_entry);
    try std.testing.expectEqual(@as(usize, 0), both.binary.counts(.section_ole).sites);
}

test "HWPX selected references skip inactive invalid references and honor source order" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch>" ++
        "<p:default><p:ole binaryItemIDRef='ole1'/></p:default>" ++
        "<p:case p:required-namespace='" ++ chart_ns ++ "'><p:chart chartIDRef='../invalid.xml'/></p:case>" ++
        "</p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var selected = try document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{chart_ns} });
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), selected.binary.counts(.section_ole).resolved_embedded);
    try std.testing.expectEqual(@as(usize, 0), selected.chart.chart_sites);
    try std.testing.expectEqual(@as(usize, 0), selected.chart.invalid_path);
}

test "HWPX selected references follow nested switches and namespace aliases" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch>" ++
        "<p:case xmlns:feature='http://www.hancom.co.kr/hwpml/2011/paragraph' feature:required-namespace='urn:outer'>" ++
        "<p:switch><p:case xmlns:e='http://www.idpf.org/2007/ops' e:required-namespace='urn:inner'>" ++
        "<p:chart chartIDRef='Chart/chart1.xml'/></p:case>" ++
        "<p:default><p:ole binaryItemIDRef='ole1'/></p:default></p:switch></p:case>" ++
        "<p:default><p:chart chartIDRef='Chart/chart2.xml'/></p:default>" ++
        "</p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var outer_missing = try document.inspectSelectedReferences(a, .{});
    defer outer_missing.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), outer_missing.chart.resolved);
    try std.testing.expectEqual(@as(usize, 0), outer_missing.binary.counts(.section_ole).sites);
    var inner_missing = try document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{"urn:outer"} });
    defer inner_missing.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), inner_missing.chart.chart_sites);
    try std.testing.expectEqual(@as(usize, 1), inner_missing.binary.counts(.section_ole).resolved_embedded);
    var both = try document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{ "urn:outer", "urn:inner" } });
    defer both.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), both.chart.resolved);
    try std.testing.expectEqual(@as(usize, 0), both.binary.counts(.section_ole).sites);
}

test "HWPX selected references mirror published empty and whitespace-only case behavior" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch>" ++
        "<p:case p:required-namespace=''><p:chart chartIDRef='Chart/missing.xml'/></p:case>" ++
        "<p:case p:required-namespace='  &#9; '><p:chart chartIDRef='Chart/chart1.xml'/></p:case>" ++
        "<p:default><p:ole binaryItemIDRef='ole1'/></p:default>" ++
        "</p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var selected = try document.inspectSelectedReferences(a, .{});
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), selected.chart.resolved);
    try std.testing.expectEqual(@as(usize, 0), selected.chart.missing_entry);
    try std.testing.expectEqual(@as(usize, 0), selected.binary.counts(.section_ole).sites);
}

test "HWPX selected references ignore unqualified requirements and unselected site budget" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch>" ++
        "<p:case required-namespace='urn:feature'><p:chart chartIDRef='Chart/missing.xml'/></p:case>" ++
        "<p:default><p:ole binaryItemIDRef='ole1'/></p:default>" ++
        "</p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var selected = try document.inspectSelectedReferences(a, .{
        .supported_namespaces = &.{"urn:feature"},
        .chart = .{ .references = .{ .sections = .{ .max_sites = 0 } } },
    });
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), selected.chart.observed_sites);
    try std.testing.expectEqual(@as(usize, 1), selected.binary.counts(.section_ole).resolved_embedded);
}

test "HWPX selected references short-circuit a satisfied paragraph requirement" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch><p:case xmlns:e='http://www.idpf.org/2007/ops' p:required-namespace='urn:yes'" ++
        " e:required-namespace='urn:this-epub-requirement-is-deliberately-longer-than-the-selection-attribute-budget'>" ++
        "<p:chart chartIDRef='Chart/chart1.xml'/></p:case><p:default><p:ole binaryItemIDRef='ole1'/></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var selected = try document.inspectSelectedReferences(a, .{
        .supported_namespaces = &.{"urn:yes"},
        .binary = .{ .references = .{ .max_attribute_bytes = 64 } },
        .chart = .{ .references = .{ .sections = .{ .max_attribute_bytes = 64 } } },
    });
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), selected.chart.resolved);
    try std.testing.expectEqual(@as(usize, 0), selected.binary.counts(.section_ole).sites);
}

test "HWPX selected references reject invalid capability names and release on failures" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:switch><p:case p:required-namespace='" ++ chart_ns ++ "'><p:chart chartIDRef='Chart/chart1.xml'/></p:case><p:default><p:ole binaryItemIDRef='ole1'/></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.InvalidSupportedNamespace, document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{"urn:bad uri"} }));
    try std.testing.expectError(error.LimitExceeded, document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{chart_ns}, .chart = .{ .references = .{ .sections = .{ .max_attribute_bytes = 1 } } } }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var doc = try package.inspectDocument(allocator, source, .{});
            defer doc.deinit(allocator);
            var result = try doc.inspectSelectedReferences(allocator, .{ .supported_namespaces = &.{chart_ns} });
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), result.chart.resolved);
        }
    }.run, .{bytes});
}
