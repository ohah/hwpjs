const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const manifest = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const page = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>" ++
    "<x:subList><p:tbl rowCnt='0' colCnt='0'/></x:subList>" ++
    "<p:tbl rowCnt='0' colCnt='0'/>" ++
    "<p:subList><x:tbl rowCnt='0' colCnt='0'/>" ++
    "<p:tbl rowCnt='1' colCnt='2' borderFillIDRef='7'><p:tr><p:tc borderFillIDRef='7'><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='2'/><p:subList><p:p><p:tbl rowCnt='0' colCnt='0' borderFillIDRef='9'/></p:p></p:subList></p:tc></p:tr></p:tbl>" ++
    "</p:subList></masterPage>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = manifest },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList><h:borderFills itemCnt='1'><h:borderFill id='7'/></h:borderFills></h:refList></h:head>" },
    .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><s:p/></s:sec>" },
    .{ .name = "Contents/masterpage0.xml", .data = page },
};

fn inspect(a: std.mem.Allocator, xml: []const u8, options: package.MasterPageTableGeometryOptions) !package.MasterPageTableGeometryReport {
    var changed = sources;
    changed[6].data = xml;
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectMasterPageTableGeometry(a, options);
}

test "HWPX master table geometry selects only root-direct subLists and nested tables" {
    const a = std.testing.allocator;
    const report = try inspect(a, page, .{});
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(page.len, report.xml_bytes);
    try std.testing.expectEqual(@as(usize, 2), report.geometry.tables);
    try std.testing.expectEqual(@as(usize, 1), report.geometry.rows);
    try std.testing.expectEqual(@as(usize, 1), report.geometry.cells);
    try std.testing.expectEqual(@as(usize, 2), report.geometry.grid_slots);
    try std.testing.expectEqual(@as(usize, 2), report.geometry.cell_slots);
    try std.testing.expectEqual(@as(usize, 1), report.geometry.table_attributes.border_fill_references.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.geometry.table_attributes.border_fill_references.missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.geometry.cell_fields.border_fill_references.resolved);
    try std.testing.expectEqual(@as(usize, 0), report.geometry.uncovered_slots);
}

test "HWPX master table geometry enforces byte, element and table budgets" {
    const a = std.testing.allocator;
    const exact = try inspect(a, page, .{ .geometry = .{ .max_total_xml_bytes = page.len } });
    try std.testing.expectEqual(page.len, exact.xml_bytes);
    try std.testing.expectError(error.LimitExceeded, inspect(a, page, .{ .geometry = .{ .max_parts = 0 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page, .{ .geometry = .{ .max_part_xml_bytes = page.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page, .{ .geometry = .{ .max_total_xml_bytes = page.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page, .{ .geometry = .{ .max_total_elements = exact.elements - 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page, .{ .geometry = .{ .geometry = .{ .max_tables = 1 } } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page, .{ .geometry = .{ .geometry = .{ .max_grid_slots = 1 } } }));
}

test "HWPX master table geometry rejects malformed selected table values" {
    const a = std.testing.allocator;
    const invalid = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:tbl rowCnt='-1' colCnt='1'/></p:subList></masterPage>";
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspect(a, invalid, .{}));
    const outside = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl rowCnt='-1' colCnt='1'/></masterPage>";
    const report = try inspect(a, outside, .{});
    try std.testing.expectEqual(@as(usize, 0), report.geometry.tables);
}

test "HWPX master table geometry survives allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspect(a, page, .{});
            try std.testing.expectEqual(@as(usize, 2), report.geometry.tables);
        }
    }.run, .{});
}

test "HWPX master table geometry applies cumulative XML, element, table and grid budgets across parts" {
    const a = std.testing.allocator;
    const second = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:tbl rowCnt='1' colCnt='1'/></p:subList></masterPage>";
    const two_manifest = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    var changed: [sources.len + 1]fixture.Source = undefined;
    @memcpy(changed[0..sources.len], &sources);
    changed[2].data = two_manifest;
    changed[sources.len] = .{ .name = "Contents/masterpage1.xml", .data = second };
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const exact = page.len + second.len;
    const report = try document.inspectMasterPageTableGeometry(a, .{ .geometry = .{ .max_parts = 2, .max_total_xml_bytes = exact } });
    try std.testing.expectEqual(@as(usize, 2), report.parts);
    try std.testing.expectEqual(@as(usize, 3), report.geometry.tables);
    try std.testing.expectEqual(@as(usize, 3), report.geometry.grid_slots);
    try std.testing.expectEqual(@as(usize, 1), report.geometry.uncovered_slots);
    try std.testing.expectEqual(exact, report.xml_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTableGeometry(a, .{ .geometry = .{ .max_total_xml_bytes = exact - 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTableGeometry(a, .{ .geometry = .{ .max_total_elements = report.elements - 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTableGeometry(a, .{ .geometry = .{ .geometry = .{ .max_tables = 2 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTableGeometry(a, .{ .geometry = .{ .geometry = .{ .max_total_grid_slots = 2 } } }));
}

test "HWPX known inspections include master table geometry and its limits" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectKnown(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.master_page_table_geometry.geometry.tables);
    try std.testing.expectEqual(@as(usize, 1), report.master_page_table_geometry.geometry.rows);
    try std.testing.expectEqual(@as(usize, 0), report.table_geometry.tables);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .master_page_table_geometry = .{ .geometry = .{ .max_tables = 1 } } }));
}
