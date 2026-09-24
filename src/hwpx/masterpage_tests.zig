const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
    "<p:secPr masterPageCnt='99'><p:masterPage idRef='masterpage0'/><p:masterPage idRef='missing'/><p:masterPage/><p:masterPage idRef='masterpage1'/></p:secPr>" ++
    "<p:p id='0' styleIDRef='0'><p:run><p:t>A</p:t></p:run></p:p></s:sec>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = section },
    .{ .name = "Contents/masterpage0.xml", .data = "<masterPage id='masterpage0' type='BOTH' pageNumber='0' pageDuplicate='0' pageFront='false' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p/></p:subList></masterPage>" },
    .{ .name = "Contents/masterpage1.xml", .data = "<masterPage id='masterpage1' type='FUTURE' pageNumber='4'/>" },
};

test "HWPX master pages keep raw fields and resolve section root IDs without trusting count" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectMasterPages(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.parts.parts.len);
    try std.testing.expectEqualStrings("masterpage0", report.parts.parts[0].id);
    try std.testing.expectEqual(@as(?@import("masterpage_parts.zig").Kind, .both), report.parts.parts[0].kind);
    try std.testing.expectEqual(@as(usize, 1), report.parts.parts[0].sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.parts.parts[0].uninspected_descendants);
    try std.testing.expect(report.parts.parts[1].kind == null);
    try std.testing.expectEqual(@as(usize, 1), report.parts.unsupported_types);
    try std.testing.expect(report.parts.parts[1].page_duplicate == null);
    try std.testing.expectEqual(@as(usize, 4), report.references.len);
    try std.testing.expectEqual(@as(usize, 2), report.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.absent_id);
    try std.testing.expectEqual(@as(usize, 0), report.unreferenced_parts);
    try std.testing.expectEqualStrings("99", report.count_declarations[0].raw);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), known.master_pages.resolved);
}

test "HWPX master pages reject malformed root and scalar fields" {
    const a = std.testing.allocator;
    for ([_]struct { part: []const u8, expected: anyerror }{
        .{ .part = "<wrong/>", .expected = error.InvalidMasterPageRoot },
        .{ .part = "<masterPage/>", .expected = error.MissingMasterPageId },
        .{ .part = "<masterPage id='masterpage0' pageNumber='4294967296'/>", .expected = error.InvalidUnsigned32 },
        .{ .part = "<masterPage id='masterpage0' pageFront='yes'/>", .expected = error.InvalidXmlBoolean },
        .{ .part = "<masterPage xmlns='http://www.owpml.org/owpml/2023/master-page' id='masterpage0'/>", .expected = error.UnsupportedHwpxNamespaceProfile },
    }) |mutation| {
        var changed = sources;
        changed[6].data = mutation.part;
        const bytes = try fixture.storedZip(a, &changed);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectError(mutation.expected, document.inspectMasterPages(a, .{}));
    }
}

test "HWPX master pages report duplicate root IDs without choosing an arbitrary target" {
    const a = std.testing.allocator;
    var changed = sources;
    changed[7].data = "<masterPage id='masterpage0' type='EVEN'/>";
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectMasterPages(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.parts.manifest_id_mismatches);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_part_ids);
    try std.testing.expectEqual(@as(usize, 1), report.ambiguous_target);
    try std.testing.expectEqual(@as(usize, 0), report.resolved);
    try std.testing.expectEqual(@as(usize, 2), report.missing_target);
    try std.testing.expectEqual(@as(usize, 2), report.unreferenced_parts);
}

test "HWPX master-page selection rejects duplicate path, external item and wrong media" {
    const a = std.testing.allocator;
    for ([_]struct { item: []const u8, expected: anyerror }{
        .{ .item = "<o:item id='alias' href='Contents/masterpage0.xml' media-type='application/xml'/>", .expected = error.DuplicateMasterPagePath },
        .{ .item = "<o:item id='alias' href='Contents/masterpage2.xml' media-type='application/xml' isEmbeded='0'/>", .expected = error.UnsupportedExternalMasterPage },
        .{ .item = "<o:item id='alias' href='Contents/masterpage2.xml' media-type='application/octet-stream' isEmbeded='0'/>", .expected = error.InvalidMasterPageMediaType },
    }) |mutation| {
        const appended = try std.mem.concat(a, u8, &.{ mutation.item, "</o:manifest>" });
        defer a.free(appended);
        const replacement = try std.mem.replaceOwned(u8, a, hpf, "</o:manifest>", appended);
        defer a.free(replacement);
        var changed = sources;
        changed[2].data = replacement;
        const bytes = try fixture.storedZip(a, &changed);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectError(mutation.expected, document.inspectMasterPages(a, .{}));
    }
}

test "HWPX master-page limits and report lifetime" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    var document = try package.inspectDocument(a, bytes, .{});
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPages(a, .{ .references = .{ .parts = .{ .max_parts = 1 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPages(a, .{ .references = .{ .max_references = 3 } }));
    const part_bytes = sources[6].data.len + sources[7].data.len;
    var exact = try document.inspectMasterPages(a, .{ .references = .{ .parts = .{ .max_total_xml_bytes = part_bytes }, .max_total_section_xml_bytes = sources[5].data.len } });
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPages(a, .{ .references = .{ .parts = .{ .max_total_xml_bytes = part_bytes - 1 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPages(a, .{ .references = .{ .max_total_section_xml_bytes = sources[5].data.len - 1 } }));
    var report = try document.inspectMasterPages(a, .{});
    document.deinit(a);
    a.free(bytes);
    defer report.deinit(a);
    try std.testing.expectEqualStrings("masterpage0", report.parts.parts[0].id);
    try std.testing.expectEqualStrings("masterpage1", report.references[3].id_ref.?);
}

test "HWPX master-page report owns values with a different ZIP allocator" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    const archive_allocator = checked.allocator();
    var document = try package.inspectDocument(archive_allocator, bytes, .{});
    var report = try document.inspectMasterPages(std.testing.allocator, .{});
    document.deinit(archive_allocator);
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try std.testing.expectEqualStrings("masterpage0", report.parts.parts[0].id);
    report.deinit(std.testing.allocator);
}

test "HWPX master pages release every allocation failure" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, input: []const u8) !void {
            var document = try package.inspectDocument(a, input, .{});
            defer document.deinit(a);
            var report = try document.inspectMasterPages(a, .{});
            report.deinit(a);
        }
    }.run, .{bytes});
}
