//! Small, strict synthetic chart graph; fixture construction is outside OOM sweeps.
const std = @import("std");
pub const chart = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:ser><c:tx><c:v>name</c:v></c:tx><c:val><c:numLit><c:ptCount val='1'/><c:pt idx='0'><c:v>2</c:v></c:pt></c:numLit></c:val></c:ser></c:chartSpace>";
pub fn make(a: std.mem.Allocator, mismatched_alias: bool) ![]u8 {
    return makeWithChart(a, chart, mismatched_alias);
}

pub fn makeWithChart(a: std.mem.Allocator, xml: []const u8, mismatched_alias: bool) ![]u8 {
    const raw = try compound(a, xml);
    defer a.free(raw);
    const other = if (mismatched_alias) try compound(a, "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:ser><c:tx><c:v>other</c:v></c:tx></c:ser></c:chartSpace>") else try a.dupe(u8, raw);
    defer a.free(other);
    const fixture = @import("test_package_fixture.zig");
    const wrapper = "<p:p><p:run><p:switch><p:case><p:chart chartIDRef='Chart/a.xml'/></p:case><p:default><p:ole binaryItemIDRef='{s}'/></p:default></p:switch></p:run></p:p>";
    const first = try std.fmt.allocPrint(a, wrapper, .{"oa"});
    defer a.free(first);
    const second = try std.fmt.allocPrint(a, wrapper, .{"ob"});
    defer a.free(second);
    const section = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", first, second, "</s:sec>" });
    defer a.free(section);
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='oa' href='BinData/a.ole' media-type='application/ole'/><o:item id='ob' href='BinData/b.ole' media-type='application/ole'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "Chart/a.xml", .data = xml },
        .{ .name = "BinData/a.ole", .data = raw },
        .{ .name = "BinData/b.ole", .data = other },
        .{ .name = "untouched", .data = "retain" },
    });
}
fn compound(a: std.mem.Allocator, xml: []const u8) ![]u8 {
    const raw = try @import("../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "OOXMLChartContents", .parent = 0, .content = xml },
        .{ .name = "Sibling", .parent = 0, .content = "opaque" },
    }, .{});
    defer a.free(raw);
    const output = try a.alloc(u8, raw.len + 4);
    std.mem.writeInt(u32, output[0..4], @intCast(raw.len), .little);
    @memcpy(output[4..], raw);
    return output;
}
