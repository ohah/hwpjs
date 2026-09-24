const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const paragraph_uri = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList>" ++
    "<h:charProperties itemCnt='2'><h:charPr id='7'/><h:charPr id='5'/></h:charProperties>" ++
    "<h:paraProperties itemCnt='2'><h:paraPr id='21'/><h:paraPr id='20'/></h:paraProperties>" ++
    "<h:styles itemCnt='1'><h:style id='7'/></h:styles>" ++
    "</h:refList></h:head>";
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
    "<p:secPr masterPageCnt='1'><p:masterPage idRef='masterpage0'/></p:secPr><p:p id='0' paraPrIDRef='20' styleIDRef='7'><p:run charPrIDRef='5'/></p:p></s:sec>";
const master = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:future'>" ++
    "<p:subList><p:p id='0' paraPrIDRef='20' styleIDRef='7'><p:run charPrIDRef='5'>" ++
    "<p:tbl><p:p id='1' paraPrIDRef='21'><p:run charPrIDRef='7'/></p:p></p:tbl>" ++
    "</p:run><p:run charPrIDRef='5'/></p:p><p:run charPrIDRef='7'/>" ++
    "<f:p paraPrIDRef='bad'/></p:subList>" ++
    "<f:subList><p:p id='2' paraPrIDRef='bad'/></f:subList></masterPage>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = header },
    .{ .name = "Contents/section0.xml", .data = section },
    .{ .name = "Contents/masterpage0.xml", .data = master },
};

test "HWPX master style references share sparse header IDs and exclude foreign siblings" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectMasterPageStyleReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.non_direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 4), report.runs);
    try std.testing.expectEqual(@as(usize, 1), report.non_direct_runs);
    try std.testing.expectEqual(@as(usize, 2), report.counts(.paragraph_shape).resolved);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).resolved);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).absent);
    try std.testing.expectEqual(@as(usize, 4), report.counts(.character_shape).resolved);
    const section_report = try document.inspectReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), section_report.paragraphs);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(report.paragraphs, known.master_page_style_references.paragraphs);
    try std.testing.expectEqual(report.runs, known.master_page_style_references.runs);
}

test "HWPX master style references separate ID zero, absent attribute and absent table" {
    const a = std.testing.allocator;
    var changed = sources;
    changed[4].data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:paraProperties><h:paraPr id='20'/></h:paraProperties><h:charProperties><h:charPr id='5'/></h:charProperties></h:refList></h:head>";
    changed[6].data = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList>" ++
        "<p:p id='0' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'/></p:p><p:p id='1'><p:run/></p:p></p:subList></masterPage>";
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectMasterPageStyleReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_shape).absent);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).absent_table);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).absent);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.character_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.character_shape).absent);
    try std.testing.expectEqual(@as(?u32, 0), report.counts(.paragraph_shape).first_unresolved_id);
    const index = report.counts(.paragraph_shape).first_unresolved_item_index.?;
    try std.testing.expectEqualStrings("Contents/masterpage0.xml", document.manifest.items[index].href);
}

test "HWPX master style references reject invalid values and exact limits" {
    const a = std.testing.allocator;
    for ([_]struct { child: []const u8, expected: anyerror }{
        .{ .child = "<p:p id='0' paraPrIDRef='bad'/>", .expected = error.InvalidResourceReferenceId },
        .{ .child = "<p:p id='0' styleIDRef='4294967296'/>", .expected = error.InvalidResourceReferenceId },
        .{ .child = "<p:p id='0'><p:run charPrIDRef='-1'/></p:p>", .expected = error.InvalidResourceReferenceId },
    }) |mutation| {
        const part = try std.fmt.allocPrint(a, "<masterPage id='masterpage0' xmlns:p='{s}'><p:subList>{s}</p:subList></masterPage>", .{ paragraph_uri, mutation.child });
        defer a.free(part);
        var changed = sources;
        changed[6].data = part;
        const bytes = try fixture.storedZip(a, &changed);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectError(mutation.expected, document.inspectMasterPageStyleReferences(a, .{}));
    }
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const exact = try document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_parts = 1, .max_part_xml_bytes = master.len, .max_total_xml_bytes = master.len, .max_paragraphs = 2, .max_runs = 4 } });
    try std.testing.expectEqual(master.len, exact.decoded_xml_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_parts = 0 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_total_xml_bytes = master.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_paragraphs = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_runs = 3 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_attribute_bytes = 0 } }));
}

test "HWPX master style references apply one total XML budget across parts" {
    const a = std.testing.allocator;
    const extra_item = "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/></o:manifest>";
    const hpf_two = try std.mem.replaceOwned(u8, a, hpf, "</o:manifest>", extra_item);
    defer a.free(hpf_two);
    const second = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p id='1' paraPrIDRef='20'><p:run charPrIDRef='5'/></p:p></p:subList></masterPage>";
    var changed: [sources.len + 1]fixture.Source = undefined;
    @memcpy(changed[0..sources.len], &sources);
    changed[2].data = hpf_two;
    changed[sources.len] = .{ .name = "Contents/masterpage1.xml", .data = second };
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const exact = try document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_total_xml_bytes = master.len + second.len } });
    try std.testing.expectEqual(@as(usize, 2), exact.parts);
    try std.testing.expectEqual(@as(usize, 3), exact.paragraphs);
    try std.testing.expectEqual(@as(usize, 5), exact.runs);
    try std.testing.expectEqual(master.len + second.len, exact.decoded_xml_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_parts = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageStyleReferences(a, .{ .references = .{ .max_total_xml_bytes = master.len + second.len - 1 } }));
}

test "HWPX master style references release every allocation failure" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(a, source, .{});
            defer document.deinit(a);
            _ = try document.inspectMasterPageStyleReferences(a, .{});
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    _ = try document.inspectMasterPageStyleReferences(checked.allocator(), .{});
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
