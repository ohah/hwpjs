const std = @import("std");
const package = @import("package.zig");

pub const Source = struct { name: []const u8, data: []const u8 };

fn write16(bytes: []u8, at: usize, value: u16) void {
    std.mem.writeInt(u16, bytes[at..][0..2], value, .little);
}

fn write32(bytes: []u8, at: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[at..][0..4], value, .little);
}

pub fn storedZip(a: std.mem.Allocator, sources: []const Source) ![]u8 {
    var locals_size: usize = 0;
    var central_size: usize = 0;
    for (sources) |source| {
        locals_size += 30 + source.name.len + source.data.len;
        central_size += 46 + source.name.len;
    }
    const bytes = try a.alloc(u8, locals_size + central_size + 22);
    @memset(bytes, 0);
    var local_offset: usize = 0;
    var central_offset: usize = locals_size;
    for (sources) |source| {
        const crc = std.hash.Crc32.hash(source.data);
        write32(bytes, local_offset, 0x04034b50);
        write16(bytes, local_offset + 4, 20);
        write32(bytes, local_offset + 14, crc);
        write32(bytes, local_offset + 18, @intCast(source.data.len));
        write32(bytes, local_offset + 22, @intCast(source.data.len));
        write16(bytes, local_offset + 26, @intCast(source.name.len));
        @memcpy(bytes[local_offset + 30 ..][0..source.name.len], source.name);
        @memcpy(bytes[local_offset + 30 + source.name.len ..][0..source.data.len], source.data);
        write32(bytes, central_offset, 0x02014b50);
        write16(bytes, central_offset + 4, 20);
        write16(bytes, central_offset + 6, 20);
        write32(bytes, central_offset + 16, crc);
        write32(bytes, central_offset + 20, @intCast(source.data.len));
        write32(bytes, central_offset + 24, @intCast(source.data.len));
        write16(bytes, central_offset + 28, @intCast(source.name.len));
        write32(bytes, central_offset + 42, @intCast(local_offset));
        @memcpy(bytes[central_offset + 46 ..][0..source.name.len], source.name);
        local_offset += 30 + source.name.len + source.data.len;
        central_offset += 46 + source.name.len;
    }
    const end = locals_size + central_size;
    write32(bytes, end, 0x06054b50);
    write16(bytes, end + 8, @intCast(sources.len));
    write16(bytes, end + 10, @intCast(sources.len));
    write32(bytes, end + 12, @intCast(central_size));
    write32(bytes, end + 16, @intCast(locals_size));
    return bytes;
}

pub const package_container = "<c:container xmlns:c=\"urn:oasis:names:tc:opendocument:xmlns:container\"><c:rootfiles><c:rootfile media-type=\"application/hwpml-package+xml\" full-path=\"Contents/content.hpf\"/><c:rootfile full-path=\"Preview/PrvText.txt\" media-type=\"text/plain\"/></c:rootfiles></c:container>";
pub const structure_header = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" version=\"1.5\" secCnt=\"2\"/>";
pub const structure_section = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\"><p:p/></s:sec>";
pub const structure_hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
    "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"a\" href=\"Contents/chapter-A.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"b\" href=\"Contents/chapter-B.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"extra\" href=\"Contents/extra.xml\" media-type=\"application/xml\"/>" ++
    "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"b\"/><p:itemref idref=\"extra\"/><p:itemref idref=\"a\"/></p:spine></p:package>";

pub fn syntheticStructureZip(a: std.mem.Allocator, header_xml: []const u8, section_xml: []const u8) ![]u8 {
    return syntheticStructureZipWithHpf(a, structure_hpf, header_xml, section_xml);
}

pub fn syntheticStructureZipWithHpf(a: std.mem.Allocator, hpf_xml: []const u8, header_xml: []const u8, section_xml: []const u8) ![]u8 {
    const sources = [_]Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = package_container },
        .{ .name = "Contents/content.hpf", .data = hpf_xml },
        .{ .name = "Contents/header.xml", .data = header_xml },
        .{ .name = "Contents/chapter-A.xml", .data = section_xml },
        .{ .name = "Contents/chapter-B.xml", .data = section_xml },
        .{ .name = "Contents/extra.xml", .data = "<misc/>" },
        .{ .name = "Contents/section1.xml", .data = section_xml },
        .{ .name = "Contents/section2.xml", .data = section_xml },
    };
    return storedZip(a, &sources);
}
