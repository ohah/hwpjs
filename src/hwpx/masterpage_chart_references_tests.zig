const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const paragraph_uri = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const chart_capability = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";
const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'>" ++
    "<p:secPr masterPageCnt='1'><p:masterPage idRef='masterpage0'/></p:secPr><p:p/></s:sec>";
const chart = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:chart/></c:chartSpace>";
const bad_chart = "<c:notChart xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'/>";

fn zipFor(a: std.mem.Allocator, master: []const u8) ![]u8 {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList/></h:head>" },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "Contents/masterpage0.xml", .data = master },
        .{ .name = "Chart/chart1.xml", .data = chart },
        .{ .name = "Chart/bad.xml", .data = bad_chart },
    };
    return fixture.storedZip(a, &sources);
}

const prefix = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "'><p:subList><p:p><p:run>";
const suffix = "</p:run></p:p></p:subList></masterPage>";

test "HWPX master chart links resolve exact ZIP paths and compose in known" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:chart chartIDRef='Chart/chart1.xml'/><p:chart chartIDRef='Chart/chart1.xml'/>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectMasterPageChartReferences(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(source.len, report.xml_bytes);
    try std.testing.expectEqual(@as(usize, 2), report.charts.chart_sites);
    try std.testing.expectEqual(@as(usize, 2), report.charts.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.charts.chart_parts);
    try std.testing.expectEqual(chart.len, report.charts.chart_xml_bytes);
    try std.testing.expectEqual(@as(usize, 0), report.charts.sections);
    try std.testing.expectEqual(@as(usize, 0), report.charts.section_xml_bytes);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), known.chart_references.chart_sites);
    try std.testing.expectEqual(report.charts.chart_sites, known.master_page_chart_references.charts.chart_sites);
    try std.testing.expectEqual(report.charts.chart_parts, known.master_page_chart_references.charts.chart_parts);
}

test "HWPX master chart links keep path diagnostics and direct subList scope" {
    const a = std.testing.allocator;
    const source = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "' xmlns:x='urn:foreign'>" ++
        "<p:p><p:run><p:chart chartIDRef='Chart/chart1.xml'/></p:run></p:p>" ++
        "<x:subList><p:p><p:run><p:chart chartIDRef='Chart/chart1.xml'/></p:run></p:p></x:subList>" ++
        "<p:subList><p:p><p:run><p:chart chartIDRef='Chart/missing.xml'/>" ++
        "<p:chart chartIDRef='../bad'/><p:chart/><p:other chartIDRef='X'/></p:run></p:p>" ++
        "<p:chart chartIDRef='Chart/chart1.xml'/></p:subList></masterPage>";
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectMasterPageChartReferences(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(@as(usize, 5), report.charts.observed_sites);
    try std.testing.expectEqual(@as(usize, 3), report.charts.chart_sites);
    try std.testing.expectEqual(@as(usize, 1), report.charts.missing_entry);
    try std.testing.expectEqual(@as(usize, 1), report.charts.invalid_path);
    try std.testing.expectEqual(@as(usize, 1), report.charts.absent);
    try std.testing.expectEqual(@as(usize, 2), report.charts.unclassified_attribute_sites);
    try std.testing.expectEqualStrings("Chart/missing.xml", report.charts.first_problem_ref.?);
    try std.testing.expectEqualStrings("X", report.charts.first_unclassified_ref.?);
}

test "HWPX master chart links select branches before resolving targets and budgets" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:switch><p:case p:required-namespace='" ++ chart_capability ++ "'>" ++
        "<p:chart chartIDRef='Chart/chart1.xml'/></p:case>" ++
        "<p:default><p:chart chartIDRef='../bad'/></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var raw = try document.inspectMasterPageChartReferences(a, .{});
    defer raw.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), raw.charts.chart_sites);
    try std.testing.expectEqual(@as(usize, 1), raw.charts.resolved);
    try std.testing.expectEqual(@as(usize, 1), raw.charts.invalid_path);
    const options: package.MasterPageChartReferenceOptions = .{ .references = .{ .max_sites = 1 } };
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageChartReferences(a, options));
    var fallback = try document.inspectSelectedMasterPageChartReferences(a, options, &.{});
    defer fallback.deinit(a);
    var case = try document.inspectSelectedMasterPageChartReferences(a, options, &.{chart_capability});
    defer case.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), fallback.charts.invalid_path);
    try std.testing.expectEqual(@as(usize, 0), fallback.charts.chart_parts);
    try std.testing.expectEqual(@as(usize, 1), case.charts.resolved);
    try std.testing.expectEqual(@as(usize, 1), case.charts.chart_parts);
    try std.testing.expectError(error.InvalidSupportedNamespace, document.inspectSelectedMasterPageChartReferences(a, .{}, &.{"urn:bad uri"}));
    try std.testing.expectError(error.LimitExceeded, document.inspectSelectedMasterPageChartReferences(a, .{ .references = .{ .charts = .{ .max_chart_parts = 0 } } }, &.{chart_capability}));
}

test "HWPX master chart links ignore invalid target XML in inactive branches" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:switch><p:case p:required-namespace='" ++ chart_capability ++ "'>" ++
        "<p:chart chartIDRef='Chart/bad.xml'/></p:case>" ++
        "<p:default><p:chart chartIDRef='Chart/chart1.xml'/></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.InvalidChartRoot, document.inspectMasterPageChartReferences(a, .{}));
    var fallback = try document.inspectSelectedMasterPageChartReferences(a, .{}, &.{});
    defer fallback.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), fallback.charts.resolved);
    try std.testing.expectError(error.InvalidChartRoot, document.inspectSelectedMasterPageChartReferences(a, .{}, &.{chart_capability}));
    try std.testing.expectError(error.LimitExceeded, document.inspectSelectedMasterPageChartReferences(a, .{ .references = .{ .max_total_xml_bytes = source.len - 1 } }, &.{}));
}

test "HWPX master chart links honor nested switches and first default" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:switch><p:case p:required-namespace='urn:outer'><p:switch>" ++
        "<p:default><p:chart chartIDRef='Chart/chart1.xml'/></p:default>" ++
        "<p:case p:required-namespace='urn:inner'><p:chart chartIDRef='Chart/bad.xml'/></p:case>" ++
        "</p:switch></p:case><p:default><p:chart chartIDRef='Chart/missing.xml'/></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var fallback = try document.inspectSelectedMasterPageChartReferences(a, .{}, &.{});
    defer fallback.deinit(a);
    var both = try document.inspectSelectedMasterPageChartReferences(a, .{}, &.{ "urn:outer", "urn:inner" });
    defer both.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), fallback.charts.missing_entry);
    try std.testing.expectEqual(@as(usize, 0), fallback.charts.chart_parts);
    try std.testing.expectEqual(@as(usize, 1), both.charts.resolved);
    try std.testing.expectEqual(@as(usize, 0), both.charts.missing_entry);
    try std.testing.expectEqual(@as(usize, 1), both.charts.chart_parts);
}

test "HWPX master chart links release allocations after every failure" {
    const bytes = try zipFor(std.testing.allocator, prefix ++ "<p:chart chartIDRef='Chart/chart1.xml'/>" ++ suffix);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(a, source, .{});
            defer document.deinit(a);
            var report = try document.inspectSelectedMasterPageChartReferences(a, .{}, &.{});
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), report.charts.resolved);
        }
    }.run, .{bytes});
}

test "HWPX master chart links keep archive and report allocators distinct" {
    const bytes = try zipFor(std.testing.allocator, prefix ++ "<p:chart chartIDRef='Chart/chart1.xml'/>" ++ suffix);
    defer std.testing.allocator.free(bytes);
    var archive_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = archive_alloc.deinit();
    var report_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = report_alloc.deinit();
    var document = try package.inspectDocument(archive_alloc.allocator(), bytes, .{});
    var report = try document.inspectMasterPageChartReferences(report_alloc.allocator(), .{});
    report.deinit(report_alloc.allocator());
    document.deinit(archive_alloc.allocator());
    try std.testing.expectEqual(@as(usize, 0), archive_alloc.total_requested_bytes);
    try std.testing.expectEqual(@as(usize, 0), report_alloc.total_requested_bytes);
}
