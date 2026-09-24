const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='setting' href='settings.xml' media-type='application/xml'/>" ++
    "<o:item id='master' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "<o:item id='alias' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "<o:item id='external' href='https://example.invalid/settings.xml' media-type='application/xml' isEmbeded='0'/>" ++
    "<o:item id='binary' href='BinData/file.bin' media-type='application/octet-stream'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>" },
    .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>" },
    .{ .name = "settings.xml", .data = "<a:settings xmlns:a='urn:settings'><a:item/></a:settings>" },
    .{ .name = "Contents/masterpage0.xml", .data = "<masterPage/>" },
    .{ .name = "BinData/file.bin", .data = "<not-xml" },
};

test "HWPX manifest XML validates all declared embedded XML once" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestXml(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 6), report.xml_items);
    try std.testing.expectEqual(@as(usize, 1), report.external_xml_items);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_xml_bindings);
    try std.testing.expectEqualSlices(usize, &.{ 3, 4, 5, 6 }, report.parsed_entry_indices);
    try std.testing.expectEqual(@as(usize, 5), report.elements);
    const total = sources[3].data.len + sources[4].data.len + sources[5].data.len + sources[6].data.len;
    try std.testing.expectEqual(total, report.decoded_xml_bytes);
    var exact = try document.inspectManifestXml(a, .{ .max_total_xml_bytes = total, .max_total_elements = 5 });
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, document.inspectManifestXml(a, .{ .max_total_xml_bytes = total - 1 }));
    try std.testing.expectError(error.LimitExceeded, document.inspectManifestXml(a, .{ .max_total_elements = 4 }));
    try std.testing.expectError(error.LimitExceeded, document.inspectManifestXml(a, .{ .max_xml_items = 5 }));
    try std.testing.expectError(error.LimitExceeded, document.inspectManifestXml(a, .{ .max_entry_xml_bytes = 1 }));
}

test "HWPX manifest XML rejects malformed settings and unselected master pages" {
    const a = std.testing.allocator;
    for ([_]struct { index: usize, data: []const u8, expected: anyerror }{
        .{ .index = 5, .data = "<settings>", .expected = error.UnclosedXmlElement },
        .{ .index = 6, .data = "<!DOCTYPE x><masterPage/>", .expected = error.UnsupportedXmlDtd },
        .{ .index = 5, .data = "<a:settings/>", .expected = error.UnboundXmlPrefix },
        .{ .index = 6, .data = "<masterPage>&unknown;</masterPage>", .expected = error.UnresolvedXmlEntity },
    }) |mutation| {
        var changed = sources;
        changed[mutation.index].data = mutation.data;
        const bytes = try fixture.storedZip(a, &changed);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectError(mutation.expected, document.inspectManifestXml(a, .{}));
    }
}

test "HWPX manifest XML uses ZIP owner allocator and releases the report" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    const a = checked.allocator();
    var document = try package.inspectDocument(a, bytes, .{});
    var report = try document.inspectManifestXml(std.testing.allocator, .{});
    document.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try std.testing.expectEqual(@as(usize, 4), report.parsed_entry_indices.len);
    report.deinit(std.testing.allocator);
}

test "HWPX manifest XML cleans all allocation failure points" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, input: []const u8) !void {
            var document = try package.inspectDocument(a, input, .{});
            defer document.deinit(a);
            var report = try document.inspectManifestXml(a, .{});
            report.deinit(a);
        }
    }.run, .{bytes});
}
