const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const paragraph_uri = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const chart_uri = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";
const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>";

fn make(a: std.mem.Allocator, section_xml: []const u8, master_xml: []const u8) ![]u8 {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = section_xml },
        .{ .name = "Contents/masterpage0.xml", .data = master_xml },
    };
    return fixture.storedZip(a, &sources);
}

const case_table = "<p:tbl rowCnt='1' colCnt='1'/>";
const default_table = "<p:tbl rowCnt='1' colCnt='2'/>";
const switch_body = "<p:switch><p:case p:required-namespace='" ++ chart_uri ++ "'>" ++ case_table ++ "</p:case><p:default>" ++ default_table ++ "</p:default></p:switch>";
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'><p:p><p:run>" ++ switch_body ++ "</p:run></p:p></s:sec>";
const master = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "'><p:subList><p:p><p:run>" ++ switch_body ++ "</p:run></p:p></p:subList></masterPage>";

test "HWPX selected table geometry separates raw and active section and master tables" {
    const a = std.testing.allocator;
    const bytes = try make(a, section, master);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var trees = try document.readXmlTrees(a, .{});
    defer trees.deinit(a);
    const raw_section = try trees.inspectTableGeometry(a, .{});
    try std.testing.expectEqual(@as(usize, 2), raw_section.tables);
    try std.testing.expectEqual(@as(usize, 3), raw_section.grid_slots);
    const fallback_section = try document.inspectSelectedTableGeometry(a, .{}, &.{});
    const case_section = try document.inspectSelectedTableGeometry(a, .{}, &.{chart_uri});
    try std.testing.expectEqual(@as(usize, 1), fallback_section.tables);
    try std.testing.expectEqual(@as(usize, 2), fallback_section.grid_slots);
    try std.testing.expectEqual(@as(usize, 1), case_section.tables);
    try std.testing.expectEqual(@as(usize, 1), case_section.grid_slots);
    const raw_master = try document.inspectMasterPageTableGeometry(a, .{});
    const fallback_master = try document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{});
    const case_master = try document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{chart_uri});
    try std.testing.expectEqual(@as(usize, 2), raw_master.geometry.tables);
    try std.testing.expectEqual(@as(usize, 3), raw_master.geometry.grid_slots);
    try std.testing.expectEqual(@as(usize, 1), fallback_master.geometry.tables);
    try std.testing.expectEqual(@as(usize, 2), fallback_master.geometry.grid_slots);
    try std.testing.expectEqual(@as(usize, 1), case_master.geometry.tables);
    try std.testing.expectEqual(@as(usize, 1), case_master.geometry.grid_slots);
}

test "HWPX selected table geometry charges table and grid budgets only to active branches" {
    const a = std.testing.allocator;
    const bytes = try make(a, section, master);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var trees = try document.readXmlTrees(a, .{});
    defer trees.deinit(a);

    const geometry: package.TableGeometryOptions = .{
        .max_tables = 1,
        .max_total_grid_slots = 2,
    };
    try std.testing.expectError(error.LimitExceeded, trees.inspectTableGeometry(a, geometry));
    const section_fallback = try document.inspectSelectedTableGeometry(a, .{ .geometry = geometry }, &.{});
    const section_case = try document.inspectSelectedTableGeometry(a, .{ .geometry = geometry }, &.{chart_uri});
    try std.testing.expectEqual(@as(usize, 2), section_fallback.grid_slots);
    try std.testing.expectEqual(@as(usize, 1), section_case.grid_slots);

    const master_options: package.MasterPageTableGeometryOptions = .{ .geometry = .{ .geometry = geometry } };
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTableGeometry(a, master_options));
    const master_fallback = try document.inspectSelectedMasterPageTableGeometry(a, master_options, &.{});
    const master_case = try document.inspectSelectedMasterPageTableGeometry(a, master_options, &.{chart_uri});
    try std.testing.expectEqual(@as(usize, 2), master_fallback.geometry.grid_slots);
    try std.testing.expectEqual(@as(usize, 1), master_case.geometry.grid_slots);
}

test "HWPX selected table geometry ignores malformed inactive table fields but retains XML checks" {
    const a = std.testing.allocator;
    const bad_switch = "<p:switch><p:case p:required-namespace='" ++ chart_uri ++ "'><p:tbl rowCnt='-1' colCnt='1'/></p:case><p:default>" ++ default_table ++ "</p:default></p:switch>";
    const bad_section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'><p:p><p:run>" ++ bad_switch ++ "</p:run></p:p></s:sec>";
    const bad_master = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "'><p:subList><p:p><p:run>" ++ bad_switch ++ "</p:run></p:p></p:subList></masterPage>";
    const bytes = try make(a, bad_section, bad_master);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const section_fallback = try document.inspectSelectedTableGeometry(a, .{}, &.{});
    const master_fallback = try document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{});
    try std.testing.expectEqual(@as(usize, 1), section_fallback.tables);
    try std.testing.expectEqual(@as(usize, 1), master_fallback.geometry.tables);
    try std.testing.expectError(error.InvalidNonNegativeInteger, document.inspectSelectedTableGeometry(a, .{}, &.{chart_uri}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{chart_uri}));
    try std.testing.expectError(error.InvalidSupportedNamespace, document.inspectSelectedTableGeometry(a, .{}, &.{"urn:bad uri"}));
    try std.testing.expectError(error.InvalidSupportedNamespace, document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{"urn:bad uri"}));
}

test "HWPX selected table geometry follows nested first-match branches" {
    const a = std.testing.allocator;
    const nested = "<p:switch><p:case p:required-namespace='urn:outer'><p:switch>" ++
        "<p:case p:required-namespace='urn:inner'><p:tbl rowCnt='1' colCnt='1'/></p:case>" ++
        "<p:default><p:tbl rowCnt='1' colCnt='2'/></p:default>" ++
        "</p:switch></p:case><p:default><p:tbl rowCnt='1' colCnt='3'/></p:default></p:switch>";
    const nested_section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'><p:p><p:run>" ++ nested ++ "</p:run></p:p></s:sec>";
    const nested_master = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "'><p:subList><p:p><p:run>" ++ nested ++ "</p:run></p:p></p:subList></masterPage>";
    const bytes = try make(a, nested_section, nested_master);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    for ([_]struct { capabilities: []const []const u8, grid: usize }{
        .{ .capabilities = &.{}, .grid = 3 },
        .{ .capabilities = &.{"urn:outer"}, .grid = 2 },
        .{ .capabilities = &.{ "urn:outer", "urn:inner" }, .grid = 1 },
    }) |case| {
        const section_report = try document.inspectSelectedTableGeometry(a, .{}, case.capabilities);
        const master_report = try document.inspectSelectedMasterPageTableGeometry(a, .{}, case.capabilities);
        try std.testing.expectEqual(@as(usize, 1), section_report.tables);
        try std.testing.expectEqual(case.grid, section_report.grid_slots);
        try std.testing.expectEqual(@as(usize, 1), master_report.geometry.tables);
        try std.testing.expectEqual(case.grid, master_report.geometry.grid_slots);
    }
}

test "HWPX selected table geometry keeps first default and foreign switch boundaries" {
    const a = std.testing.allocator;
    const body = "<p:switch><p:default><p:tbl rowCnt='1' colCnt='2'/></p:default>" ++
        "<p:case p:required-namespace='" ++ chart_uri ++ "'><p:tbl rowCnt='-1' colCnt='1'/></p:case></p:switch>" ++
        "<x:switch xmlns:x='urn:foreign'><p:case><p:tbl rowCnt='1' colCnt='3'/></p:case><p:default><p:tbl rowCnt='1' colCnt='4'/></p:default></x:switch>";
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'><p:p><p:run>" ++ body ++ "</p:run></p:p></s:sec>";
    const bytes = try make(a, source, "<masterPage id='masterpage0'/>");
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectSelectedTableGeometry(a, .{}, &.{chart_uri});
    try std.testing.expectEqual(@as(usize, 3), report.tables);
    try std.testing.expectEqual(@as(usize, 9), report.grid_slots);
}

test "HWPX selected table geometry does not activate a switch below a run inside text" {
    const a = std.testing.allocator;
    const inner = "<p:t><p:run>" ++ switch_body ++ "</p:run></p:t>";
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'><p:p><p:run>" ++ inner ++ "</p:run></p:p></s:sec>";
    const master_source = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "'><p:subList><p:p><p:run>" ++ inner ++ "</p:run></p:p></p:subList></masterPage>";
    const bytes = try make(a, source, master_source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const text_report = try document.inspectSelectedSectionText(a, .{}, &.{chart_uri}, null);
    const section_report = try document.inspectSelectedTableGeometry(a, .{}, &.{chart_uri});
    const master_report = try document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{chart_uri});
    try std.testing.expectEqual(@as(usize, 1), text_report.runs);
    try std.testing.expectEqual(@as(usize, 2), section_report.tables);
    try std.testing.expectEqual(@as(usize, 3), section_report.grid_slots);
    try std.testing.expectEqual(@as(usize, 2), master_report.geometry.tables);
    try std.testing.expectEqual(@as(usize, 3), master_report.geometry.grid_slots);
}

test "HWPX selected table geometry accepts expanded paragraph and EPUB requirements" {
    const a = std.testing.allocator;
    const body = "<p:switch xmlns:q='" ++ paragraph_uri ++ "' xmlns:epub='http://www.idpf.org/2007/ops'>" ++
        "<p:case q:required-namespace='urn:missing' epub:required-namespace='urn:epub'><p:tbl rowCnt='1' colCnt='1'/></p:case>" ++
        "<p:case q:required-namespace='urn:paragraph'><p:tbl rowCnt='1' colCnt='2'/></p:case>" ++
        "<p:default><p:tbl rowCnt='1' colCnt='3'/></p:default></p:switch>";
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'><p:p><p:run>" ++ body ++ "</p:run></p:p></s:sec>";
    const bytes = try make(a, source, "<masterPage id='masterpage0'/>");
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const fallback = try document.inspectSelectedTableGeometry(a, .{}, &.{});
    const epub = try document.inspectSelectedTableGeometry(a, .{}, &.{"urn:epub"});
    const paragraph = try document.inspectSelectedTableGeometry(a, .{}, &.{"urn:paragraph"});
    try std.testing.expectEqual(@as(usize, 3), fallback.grid_slots);
    try std.testing.expectEqual(@as(usize, 1), epub.grid_slots);
    try std.testing.expectEqual(@as(usize, 2), paragraph.grid_slots);
}

test "HWPX selected table geometry preserves whitespace-only requirement and lazy EPUB lookup" {
    const a = std.testing.allocator;
    const whitespace = "<p:switch><p:case p:required-namespace=' &#x20; '><p:tbl rowCnt='1' colCnt='1'/></p:case><p:default><p:tbl rowCnt='1' colCnt='2'/></p:default></p:switch>";
    const lazy = "<p:switch xmlns:epub='http://www.idpf.org/2007/ops'><p:case p:required-namespace='urn:yes' epub:required-namespace='urn:too-long-to-decode'><p:tbl rowCnt='1' colCnt='1'/></p:case><p:default><p:tbl rowCnt='1' colCnt='2'/></p:default></p:switch>";
    const whitespace_section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'><p:p><p:run>" ++ whitespace ++ "</p:run></p:p></s:sec>";
    const lazy_master = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "'><p:subList><p:p><p:run>" ++ lazy ++ "</p:run></p:p></p:subList></masterPage>";
    const bytes = try make(a, whitespace_section, lazy_master);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const whitespace_report = try document.inspectSelectedTableGeometry(a, .{}, &.{});
    try std.testing.expectEqual(@as(usize, 1), whitespace_report.grid_slots);
    const lazy_report = try document.inspectSelectedMasterPageTableGeometry(a, .{ .geometry = .{ .geometry = .{ .max_attribute_bytes = 7 } } }, &.{"urn:yes"});
    try std.testing.expectEqual(@as(usize, 1), lazy_report.geometry.grid_slots);
}

test "HWPX selected table geometry releases allocations after every failure" {
    const bytes = try make(std.testing.allocator, section, master);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(a, source, .{});
            defer document.deinit(a);
            const section_report = try document.inspectSelectedTableGeometry(a, .{}, &.{chart_uri});
            const master_report = try document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{chart_uri});
            try std.testing.expectEqual(@as(usize, 1), section_report.tables);
            try std.testing.expectEqual(@as(usize, 1), master_report.geometry.tables);
        }
    }.run, .{bytes});
}
