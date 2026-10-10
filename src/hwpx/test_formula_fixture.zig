pub const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:t>2</p:t></p:run></p:p></p:subList></p:tc><p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'><p:parameters><p:stringParam name='Command'>=SUM(A1:A1)??%g,;;2</p:stringParam><p:stringParam name='Formula'>=SUM(A1:A1)</p:stringParam><p:stringParam name='ResultFormat'>%g,</p:stringParam><p:stringParam name='LastResult'>2</p:stringParam></p:parameters></p:fieldBegin></p:ctrl><p:t>2</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>";
const std = @import("std");

pub fn zipWithParagraphs(a: std.mem.Allocator, paragraphs: []const u8) ![]u8 {
    const boundary = std.mem.indexOf(u8, section, "<p:tbl").?;
    const xml = try std.mem.concat(a, u8, &.{ section[0..boundary], paragraphs, section[boundary..] });
    defer a.free(xml);
    return zipWithSection(a, xml);
}

pub fn zipWithSection(a: std.mem.Allocator, xml: []const u8) ![]u8 {
    return zipWithSectionHeader(a, xml, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>");
}

pub fn zipWithSectionHeader(a: std.mem.Allocator, xml: []const u8, header: []const u8) ![]u8 {
    const fixture = @import("test_package_fixture.zig");
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = xml },
    });
}
