const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "<o:item id='image1' href='BinData/image1.png' media-type='image/png' isEmbeded='1'/>" ++
    "<o:item id='external1' href='https://example.invalid/image.png' media-type='image/png' isEmbeded='0'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const master = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:foreign'>" ++
    "<x:subList><p:p><p:run><p:pic><c:img binaryItemIDRef='ignore'/></p:pic></p:run></p:p></x:subList>" ++
    "<p:subList><p:p><p:run>" ++
    "<p:pic><c:img binaryItemIDRef='image&#49;'/></p:pic>" ++
    "<p:container><p:pic><c:img binaryItemIDRef='missing'/></p:pic></p:container>" ++
    "<p:ole binaryItemIDRef='external1'/>" ++
    "<p:rect><c:fillBrush><c:imgBrush><c:img binaryItemIDRef='image1'/></c:imgBrush></c:fillBrush></p:rect>" ++
    "<p:pic><c:img/></p:pic><p:other><c:img binaryItemIDRef='image1'/></p:other>" ++
    "</p:run></p:p></p:subList>" ++
    "<p:outside><p:p><p:run><p:pic><c:img binaryItemIDRef='ignore'/></p:pic></p:run></p:p></p:outside></masterPage>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><s:p/></s:sec>" },
    .{ .name = "Contents/masterpage0.xml", .data = master },
    .{ .name = "BinData/image1.png", .data = "PNG" },
};

fn inspect(a: std.mem.Allocator, source: []const u8, options: package.MasterPageBinaryReferenceOptions) !package.MasterPageBinaryReferenceReport {
    var changed = sources;
    changed[6].data = source;
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectMasterPageBinaryReferences(a, options);
}

fn expectError(a: std.mem.Allocator, source: []const u8, options: package.MasterPageBinaryReferenceOptions, expected: anyerror) !void {
    if (inspect(a, source, options)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX master binary links resolve exact IDs only inside direct subLists" {
    const a = std.testing.allocator;
    var report = try inspect(a, master, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(master.len, report.xml_bytes);
    try std.testing.expectEqual(@as(usize, 6), report.links.observed_sites);
    try std.testing.expectEqual(@as(usize, 3), report.counts(.master_picture).sites);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.master_picture).resolved_embedded);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.master_picture).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.master_picture).absent);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.master_brush_image).resolved_embedded);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.master_ole).resolved_external);
    try std.testing.expectEqual(@as(usize, 1), report.links.unclassified_attribute_sites);
    try std.testing.expectEqualStrings("missing", report.links.first_missing_id.?);
    try std.testing.expectEqual(@as(?usize, 2), report.links.first_missing_item_index);
    try std.testing.expectEqualStrings("image1", report.links.first_unclassified_id.?);
}

test "HWPX master binary links enforce independent exact limits" {
    const a = std.testing.allocator;
    var exact = try inspect(a, master, .{ .references = .{ .max_parts = 1, .max_total_xml_bytes = master.len, .scan = .{ .max_part_xml_bytes = master.len, .max_sites = 6 } } });
    exact.deinit(a);
    try expectError(a, master, .{ .references = .{ .max_parts = 0 } }, error.LimitExceeded);
    try expectError(a, master, .{ .references = .{ .max_total_xml_bytes = master.len - 1 } }, error.LimitExceeded);
    try expectError(a, master, .{ .references = .{ .scan = .{ .max_part_xml_bytes = master.len - 1 } } }, error.LimitExceeded);
    try expectError(a, master, .{ .references = .{ .scan = .{ .max_sites = 5 } } }, error.LimitExceeded);
    try expectError(a, master, .{ .references = .{ .scan = .{ .max_attribute_bytes = 0 } } }, error.LimitExceeded);
}

test "HWPX master binary links apply cumulative budgets across parts" {
    const a = std.testing.allocator;
    const second_hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/>" ++
        "<o:item id='image1' href='BinData/image1.png' media-type='image/png' isEmbeded='1'/>" ++
        "<o:item id='external1' href='https://example.invalid/image.png' media-type='image/png' isEmbeded='0'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const second = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:subList><p:p><p:run><p:pic><c:img binaryItemIDRef='image1'/></p:pic></p:run></p:p></p:subList></masterPage>";
    var changed: [sources.len + 1]fixture.Source = undefined;
    @memcpy(changed[0..sources.len], &sources);
    changed[2].data = second_hpf;
    changed[sources.len] = .{ .name = "Contents/masterpage1.xml", .data = second };
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const combined = master.len + second.len;
    var exact = try document.inspectMasterPageBinaryReferences(a, .{ .references = .{ .max_parts = 2, .max_total_xml_bytes = combined, .scan = .{ .max_sites = 7 } } });
    defer exact.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), exact.parts);
    try std.testing.expectEqual(@as(usize, 2), exact.sub_lists);
    try std.testing.expectEqual(combined, exact.xml_bytes);
    try std.testing.expectEqual(@as(usize, 2), exact.counts(.master_picture).resolved_embedded);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageBinaryReferences(a, .{ .references = .{ .max_parts = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageBinaryReferences(a, .{ .references = .{ .max_total_xml_bytes = combined - 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageBinaryReferences(a, .{ .references = .{ .scan = .{ .max_sites = 6 } } }));
}

test "HWPX master binary links select switch branches but validate XML" {
    const source = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>" ++
        "<p:subList><p:p><p:run><p:switch>" ++
        "<p:case p:required-namespace='urn:feature'><p:pic><c:img binaryItemIDRef='missing'/></p:pic></p:case>" ++
        "<p:default><p:pic><c:img binaryItemIDRef='image1'/></p:pic></p:default>" ++
        "</p:switch></p:run></p:p></p:subList></masterPage>";
    const a = std.testing.allocator;
    var raw = try inspect(a, source, .{});
    defer raw.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), raw.counts(.master_picture).sites);
    try std.testing.expectEqual(@as(usize, 1), raw.counts(.master_picture).missing_target);
    var fallback = try inspect(a, source, .{ .references = .{ .scan = .{ .branch_policy = .{ .mode = .selected } } } });
    defer fallback.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), fallback.counts(.master_picture).resolved_embedded);
    try std.testing.expectEqual(@as(usize, 0), fallback.counts(.master_picture).missing_target);
    var selected = try inspect(a, source, .{ .references = .{ .scan = .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"urn:feature"} } } } });
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), selected.counts(.master_picture).missing_target);
    try std.testing.expectEqual(@as(usize, 0), selected.counts(.master_picture).resolved_embedded);
    try expectError(a, source, .{ .references = .{ .scan = .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"urn:bad uri"} } } } }, error.InvalidSupportedNamespace);
    const malformed = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>" ++
        "<p:subList><p:p><p:run><p:switch><p:case p:required-namespace='urn:other'>" ++
        "<p:pic><c:img binaryItemIDRef='&#x110000;'/></p:pic></p:case>" ++
        "<p:default><p:pic><c:img binaryItemIDRef='image1'/></p:pic></p:default>" ++
        "</p:switch></p:run></p:p></p:subList></masterPage>";
    try expectError(a, malformed, .{ .references = .{ .scan = .{ .branch_policy = .{ .mode = .selected } } } }, error.XmlCharacterReferenceOutOfRange);
}

test "HWPX master binary links clean up every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, master, .{});
            report.deinit(a);
        }
    }.run, .{});
}

test "HWPX master binary links compose in known report and recover after a limit" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .master_page_binary_references = .{ .scan = .{ .max_sites = 5 } } }));
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), known.master_page_binary_references.parts);
    try std.testing.expectEqual(@as(usize, 1), known.master_page_binary_references.counts(.master_picture).missing_target);
}
