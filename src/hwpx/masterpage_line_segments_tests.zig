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
    .{ .name = "Contents/masterpage0.xml", .data = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><x:subList><p:p><p:linesegarray/></p:p></x:subList><p:subList><p:p><x:linesegarray/><p:linesegarray x:extra='1'><x:lineseg/><p:lineseg textpos='4294967295' spacing='-1' flags='0' x:extra='2'><x:child/></p:lineseg></p:linesegarray></p:p><p:tbl><p:p><p:linesegarray/></p:p></p:tbl></p:subList></masterPage>" },
};

fn inspect(a: std.mem.Allocator, master: []const u8, options: package.MasterPageLineSegmentsOptions) !package.MasterPageLineSegmentsReport {
    var changed = sources;
    changed[6].data = master;
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectMasterPageLineSegments(a, options);
}

test "HWPX master line segments select direct subLists and share scalar rules" {
    const report = try inspect(std.testing.allocator, sources[6].data, .{});
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), report.lines.arrays);
    try std.testing.expectEqual(@as(usize, 1), report.lines.segments);
    try std.testing.expectEqual(@as(usize, 1), report.lines.empty_arrays);
    try std.testing.expectEqual(@as(usize, 1), report.lines.array_other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.lines.array_other_direct);
    try std.testing.expectEqual(@as(usize, 1), report.lines.array_foreign_direct);
    try std.testing.expectEqual(@as(usize, 1), report.lines.segment_other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.lines.segment_foreign_direct);
    try std.testing.expectEqual(@as(i64, 4294967295), report.lines.field_sum[0]);
    try std.testing.expectEqual(@as(i64, -1), report.lines.field_sum[5]);
    try std.testing.expectEqual(@as(usize, 1), report.lines.field_highbit[0]);
    try std.testing.expectEqual(@as(usize, 1), report.lines.field_negative[5]);
    try std.testing.expectEqual(@as(usize, 1), report.lines.field_zero[8]);
    try std.testing.expectEqual(@as(usize, 1), report.lines.field_missing[1]);
}

test "HWPX master line segments reject malformed values and exact limits" {
    const a = std.testing.allocator;
    const valid = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p><p:linesegarray><p:lineseg spacing='-1'/></p:linesegarray></p:p></p:subList></masterPage>";
    try std.testing.expectError(error.LimitExceeded, inspect(a, valid, .{ .line_segments = .{ .scan = .{ .max_arrays = 0 } } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, valid, .{ .line_segments = .{ .scan = .{ .max_segments = 0 } } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, valid, .{ .line_segments = .{ .max_parts = 0 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, valid, .{ .line_segments = .{ .max_part_xml_bytes = valid.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, valid, .{ .line_segments = .{ .max_total_xml_bytes = valid.len - 1 } }));
    const exact = try inspect(a, valid, .{ .line_segments = .{ .max_part_xml_bytes = valid.len, .max_total_xml_bytes = valid.len, .scan = .{ .max_arrays = 1, .max_segments = 1 } } });
    try std.testing.expectEqual(@as(usize, 1), exact.lines.segments);
    const bad = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p><p:linesegarray><p:lineseg spacing='-2147483649'/></p:linesegarray></p:p></p:subList></masterPage>";
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspect(a, bad, .{}));
}

test "HWPX master line segments release allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspect(a, sources[6].data, .{});
            try std.testing.expectEqual(@as(usize, 1), report.lines.segments);
        }
    }.run, .{});
}

test "HWPX master line segments enforce one XML budget across parts" {
    const a = std.testing.allocator;
    const second = "<masterPage id='masterpage1'/>";
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
    const report = try document.inspectMasterPageLineSegments(a, .{ .line_segments = .{ .max_parts = 2, .max_total_xml_bytes = exact_bytes } });
    try std.testing.expectEqual(@as(usize, 2), report.parts);
    try std.testing.expectEqual(exact_bytes, report.xml_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageLineSegments(a, .{ .line_segments = .{ .max_parts = 2, .max_total_xml_bytes = exact_bytes - 1 } }));
}
