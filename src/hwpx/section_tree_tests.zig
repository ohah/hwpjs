const std = @import("std");
const package = @import("package.zig");
const tree = @import("section_tree.zig");
const fixture = @import("test_package_fixture.zig");
const document_xml = @import("document_xml.zig");

const section_uri = document_xml.section_uri;
const paragraph_uri = document_xml.paragraph_uri;
const section = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:x=\"urn:extension\">" ++
    "<p:p id=\"1\"><p:run><p:t>A&amp;<![CDATA[B]]><x:mark/></p:t></p:run><x:table><p:p/></x:table></p:p>" ++
    "<x:p xmlns:p=\"urn:rebound\"/><p:p xmlns:p=\"urn:rebound\"><p:run/></p:p>" ++
    "</s:sec>";

test "HWPX section tree owns all XML nodes and exact source spans" {
    const a = std.testing.allocator;
    var parsed = try tree.parse(a, section, 3, 9, .{});
    defer parsed.deinit(a);
    try std.testing.expectEqualStrings(section, parsed.source);
    try std.testing.expectEqual(@as(usize, 3), parsed.section_ordinal);
    try std.testing.expectEqual(@as(usize, 9), parsed.item_index);
    try std.testing.expectEqual(@as(usize, 10), parsed.elements.len);
    try std.testing.expectEqual(parsed.xml_report.elements, parsed.elements.len);
    try std.testing.expect(parsed.elements[0].is(section_uri, "sec"));
    try std.testing.expect(parsed.elements[1].is(paragraph_uri, "p"));
    try std.testing.expect(parsed.elements[2].is(paragraph_uri, "run"));
    try std.testing.expect(parsed.elements[3].is(paragraph_uri, "t"));
    try std.testing.expect(parsed.elements[4].is("urn:extension", "mark"));
    try std.testing.expect(parsed.elements[5].is("urn:extension", "table"));
    try std.testing.expect(parsed.elements[6].is(paragraph_uri, "p"));
    try std.testing.expect(parsed.elements[7].is("urn:extension", "p"));
    try std.testing.expect(parsed.elements[8].is("urn:rebound", "p"));
    try std.testing.expect(parsed.elements[9].is("urn:rebound", "run"));
    try std.testing.expectEqual(@as(?usize, null), parsed.elements[0].parent);
    try std.testing.expectEqual(@as(?usize, 1), parsed.elements[0].first_child);
    try std.testing.expectEqual(@as(?usize, 7), parsed.elements[1].next_sibling);
    try std.testing.expectEqual(@as(?usize, 8), parsed.elements[7].next_sibling);
    try std.testing.expectEqual(@as(?usize, 5), parsed.elements[2].next_sibling);
    try std.testing.expectEqual(@as(?usize, 6), parsed.elements[5].first_child);
    try std.testing.expectEqual(@as(?usize, 5), parsed.elements[6].parent);
    try std.testing.expectEqualStrings("<p:p/>", parsed.sourceOf(6));
    try std.testing.expectEqualStrings("<x:mark/>", parsed.sourceOf(4));
    try std.testing.expectEqualStrings("<p:t>A&amp;<![CDATA[B]]><x:mark/></p:t>", parsed.sourceOf(3));
    try std.testing.expectEqualStrings("</p:t>", parsed.source[parsed.elements[3].end_tag.?.start..parsed.elements[3].end_tag.?.end]);
    try std.testing.expect(parsed.elements[4].end_tag == null);
    try std.testing.expect(parsed.elements[3].end_tag != null);
}

test "HWPX section tree selects a spine section and survives archive release" {
    const a = std.testing.allocator;
    const hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
        "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"section\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++
        "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"section\"/></p:spine></p:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" secCnt=\"1\"/>" },
        .{ .name = "Contents/section0.xml", .data = section },
    };
    const bytes = try fixture.storedZip(a, &sources);
    var document = try package.inspectDocument(a, bytes, .{});
    try std.testing.expectError(error.SectionOutOfRange, document.readSectionTree(a, 1, .{}));
    try std.testing.expectError(error.LimitExceeded, document.readSectionTree(a, 0, .{ .tree = .{ .max_nodes = 9 } }));
    var parsed = try document.readSectionTree(a, 0, .{});
    document.deinit(a);
    a.free(bytes);
    defer parsed.deinit(a);
    try std.testing.expectEqualStrings(section, parsed.source);
    try std.testing.expectEqual(@as(usize, 0), parsed.section_ordinal);
    try std.testing.expect(parsed.elements[0].is(section_uri, "sec"));
}

test "HWPX section tree rejects roots, malformed source and exact limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidSectionRoot, tree.parse(a, "<x:sec xmlns:x=\"urn:other\"/>", 0, 0, .{}));
    try std.testing.expectError(error.XmlElementNameMismatch, tree.parse(a, "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\"><a></b></s:sec>", 0, 0, .{}));
    try std.testing.expectError(error.UnboundXmlPrefix, tree.parse(a, "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\"><x:future/></s:sec>", 0, 0, .{}));
    try std.testing.expectError(error.UnsupportedXmlDtd, tree.parse(a, "<!DOCTYPE sec><s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\"/>", 0, 0, .{}));
    try std.testing.expectError(error.LimitExceeded, tree.parse(a, section, 0, 0, .{ .max_xml_bytes = section.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, tree.parse(a, section, 0, 0, .{ .max_nodes = 9 }));
    var parsed = try tree.parse(a, section, 0, 0, .{ .max_xml_bytes = section.len, .max_nodes = 10 });
    defer parsed.deinit(a);
    try std.testing.expectEqual(@as(usize, 10), parsed.elements.len);
}

test "HWPX section tree spans remain raw UTF16 for both byte orders" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const name = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ name ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><x/></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var parsed = try tree.parse(a, raw, 0, 0, .{});
        defer parsed.deinit(a);
        try std.testing.expectEqualSlices(u8, raw, parsed.source);
        try std.testing.expectEqual(@as(usize, 2), parsed.elements.len);
        try std.testing.expect(parsed.elements[0].is(section_uri, "sec"));
        try std.testing.expect(parsed.elements[1].is("", "x"));
        try std.testing.expectEqualStrings(if (order == .little) "<\x00x\x00/\x00>\x00" else "\x00<\x00x\x00/\x00>", parsed.sourceOf(1));
    }
}

test "HWPX section tree cleans up on every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var parsed = try tree.parse(a, section, 0, 0, .{});
            defer parsed.deinit(a);
            try std.testing.expectEqual(@as(usize, 10), parsed.elements.len);
        }
    }.run, .{});
}
