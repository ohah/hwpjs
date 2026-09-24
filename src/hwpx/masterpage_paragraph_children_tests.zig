const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><s:p/></s:sec>" },
    .{ .name = "Contents/masterpage0.xml", .data = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><x:subList><p:p><p:run/></p:p></x:subList><p:subList><p:p><p:run/><p:linesegarray/><p:linesegarray/><x:run/><p:other><p:p><p:run/></p:p></p:other></p:p><p:p><x:linesegarray/></p:p></p:subList></masterPage>" },
};

fn inspect(a: std.mem.Allocator, master: []const u8, options: package.MasterPageParagraphChildrenOptions) !package.MasterPageParagraphChildrenReport {
    var changed = sources;
    changed[6].data = master;
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectMasterPageParagraphChildren(a, options);
}

test "HWPX master paragraph children select direct subLists and share PType classification" {
    const report = try inspect(std.testing.allocator, sources[6].data, .{});
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(@as(usize, 3), report.children.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), report.children.direct_runs);
    try std.testing.expectEqual(@as(usize, 2), report.children.line_seg_arrays);
    try std.testing.expectEqual(@as(usize, 1), report.children.paragraphs_without_run);
    try std.testing.expectEqual(@as(usize, 2), report.children.paragraphs_without_line_seg_array);
    try std.testing.expectEqual(@as(usize, 1), report.children.paragraphs_with_multiple_line_seg_arrays);
    try std.testing.expectEqual(@as(usize, 3), report.children.other_direct);
    try std.testing.expectEqual(@as(usize, 2), report.children.foreign_direct);
}

test "HWPX master paragraph children enforce exact scan and part byte limits" {
    const a = std.testing.allocator;
    const master = sources[6].data;
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .children = .{ .scan = .{ .max_paragraphs = 2 } } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .children = .{ .scan = .{ .max_direct_children = 6 } } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .children = .{ .max_parts = 0 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .children = .{ .max_part_xml_bytes = master.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .children = .{ .max_total_xml_bytes = master.len - 1 } }));
    const exact = try inspect(a, master, .{ .children = .{ .max_part_xml_bytes = master.len, .max_total_xml_bytes = master.len, .scan = .{ .max_paragraphs = 3, .max_direct_children = 7 } } });
    try std.testing.expectEqual(@as(usize, 3), exact.children.paragraphs);
}

test "HWPX master paragraph children enforce one total budget across parts" {
    const a = std.testing.allocator;
    const second = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p><p:run/></p:p></p:subList></masterPage>";
    const hpf_two = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    var changed: [sources.len + 1]fixture.Source = undefined;
    @memcpy(changed[0..sources.len], &sources);
    changed[2].data = hpf_two;
    changed[sources.len] = .{ .name = "Contents/masterpage1.xml", .data = second };
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const exact_bytes = sources[6].data.len + second.len;
    const report = try document.inspectMasterPageParagraphChildren(a, .{ .children = .{ .max_parts = 2, .max_total_xml_bytes = exact_bytes, .scan = .{ .max_paragraphs = 4, .max_direct_children = 8 } } });
    try std.testing.expectEqual(@as(usize, 2), report.parts);
    try std.testing.expectEqual(@as(usize, 4), report.children.paragraphs);
    try std.testing.expectEqual(exact_bytes, report.xml_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageParagraphChildren(a, .{ .children = .{ .max_total_xml_bytes = exact_bytes - 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageParagraphChildren(a, .{ .children = .{ .scan = .{ .max_direct_children = 7 } } }));
}

test "HWPX master paragraph children release allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspect(a, sources[6].data, .{});
            try std.testing.expectEqual(@as(usize, 3), report.children.paragraphs);
        }
    }.run, .{});
}
