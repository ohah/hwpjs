const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const page0 = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'>" ++
    "<x:fillBrush/><p:polygon><c:fillBrush><c:winBrush faceColor='none' hatchColor='#11223344' alpha='0'/></c:fillBrush></p:polygon>" ++
    "<p:subList><p:polygon><c:fillBrush><c:imgBrush mode='ZOOM'><c:img binaryItemIDRef='img1' bright='-1' effect='REAL_PIC' alpha='0'/></c:imgBrush></c:fillBrush></p:polygon></p:subList></masterPage>";
const page1 = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>" ++
    "<p:subList><p:polygon><c:fillBrush><c:gradation type='LINEAR' colorNum='1' alpha='0'><c:color value='#ABCDEF'/></c:gradation></c:fillBrush></p:polygon></p:subList></masterPage>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>" },
    .{ .name = "Contents/masterpage0.xml", .data = page0 },
    .{ .name = "Contents/masterpage1.xml", .data = page1 },
};

fn inspect(a: std.mem.Allocator, first: []const u8, second: []const u8, options: package.MasterPageFillBrushOptions) !package.MasterPageFillBrushReport {
    var changed = sources;
    changed[6].data = first;
    changed[7].data = second;
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectMasterPageFillBrushes(a, options);
}

test "HWPX master fill brushes reuse core fields across selected parts and root locations" {
    const a = std.testing.allocator;
    var report = try inspect(a, page0, page1, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), report.header_and_sections);
    try std.testing.expectEqual(@as(usize, 2), report.master_pages);
    try std.testing.expectEqual(@as(usize, 3), report.brushes.len);
    try std.testing.expectEqual(@as(usize, 1), report.count(.win_brush));
    try std.testing.expectEqual(@as(usize, 1), report.count(.gradation));
    try std.testing.expectEqual(@as(usize, 1), report.count(.img_brush));
    try std.testing.expectEqual(@as(usize, 1), report.count(.image));
    try std.testing.expectEqual(@as(usize, 1), report.count(.color));
    try std.testing.expectEqual(@as(usize, 2), report.non_six_hex_colors);
    try std.testing.expectEqual(@as(usize, 2), report.brushes[0].part_item_index);
    try std.testing.expectEqual(@as(usize, 2), report.brushes[1].part_item_index);
    try std.testing.expectEqual(@as(usize, 3), report.brushes[2].part_item_index);
    try std.testing.expect(report.brushes[0].part_kind == .master_page and report.brushes[2].part_kind == .master_page);
    try std.testing.expectEqualStrings("none", report.nodes[0].get(.face_color).?);
    try std.testing.expectEqualStrings("img1", report.nodes[2].get(.binary_item_id_ref).?);
    try std.testing.expectEqualStrings("#ABCDEF", report.nodes[4].get(.color_value).?);
}

test "HWPX master fill brushes enforce part, XML, element and brush budgets" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspect(a, page0, page1, .{ .brushes = .{ .max_parts = 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page0, page1, .{ .brushes = .{ .max_part_xml_bytes = page0.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page0, page1, .{ .brushes = .{ .max_total_xml_bytes = page0.len + page1.len - 1 } }));
    var exact_xml = try inspect(a, page0, page1, .{ .brushes = .{ .max_total_xml_bytes = page0.len + page1.len } });
    exact_xml.deinit(a);
    try std.testing.expectError(error.LimitExceeded, inspect(a, page0, page1, .{ .brushes = .{ .max_total_elements = 1 } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page0, page1, .{ .brushes = .{ .brush = .{ .max_brushes = 2 } } }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, page0, page1, .{ .brushes = .{ .brush = .{ .max_total_attribute_bytes = 0 } } }));
    var measured = try inspect(a, page0, page1, .{});
    const exact_attributes = measured.attribute_bytes;
    measured.deinit(a);
    try std.testing.expectError(error.LimitExceeded, inspect(a, page0, page1, .{ .brushes = .{ .brush = .{ .max_total_attribute_bytes = exact_attributes - 1 } } }));
    var exact = try inspect(a, page0, page1, .{ .brushes = .{ .brush = .{ .max_total_attribute_bytes = exact_attributes } } });
    exact.deinit(a);
    const invalid = "<masterPage id='masterpage1' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><c:fillBrush><c:winBrush alpha='1_0'/></c:fillBrush></masterPage>";
    try std.testing.expectError(error.InvalidXmlFloat, inspect(a, page0, invalid, .{}));
    try std.testing.expectError(error.UnexpectedEnd, inspect(a, page0, "<broken", .{}));
}

test "HWPX master fill brushes connect known report and release every failure" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectKnown(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), report.master_page_fill_brushes.brushes.len);
    try std.testing.expectEqual(@as(usize, 0), report.fill_brushes.brushes.len);
    try std.testing.expectEqual(@as(usize, 1), report.master_page_fill_brush_image_links.sites.len);
    try std.testing.expectEqual(@as(usize, 1), report.master_page_fill_brush_image_links.count(.missing));
    try std.testing.expectEqual(@as(usize, 0), report.master_page_binary_references.counts(.master_brush_image).sites);
    try std.testing.expectEqual(@as(usize, 0), report.fill_brush_image_links.sites.len);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .master_page_fill_brush_image_links = .{ .max_sites = 0 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .master_page_fill_brushes = .{ .brush = .{ .max_nodes = 0 } } }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var observed = try inspect(allocator, page0, page1, .{});
            defer observed.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), observed.brushes.len);
        }
    }.run, .{});
}

test "HWPX master fill brushes inspect an embedded image outside streaming scope" {
    const a = std.testing.allocator;
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 0);
    defer a.free(png);
    const hpf_with_image = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/>" ++
        "<o:item id='img1' href='BinData/img.png' media-type='image/png'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    var changed = sources ++ [_]fixture.Source{.{ .name = "BinData/img.png", .data = png }};
    changed[2].data = hpf_with_image;
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), known.master_page_binary_references.counts(.master_brush_image).sites);
    try std.testing.expectEqual(@as(usize, 1), known.master_page_fill_brush_image_links.sites.len);
    try std.testing.expectEqual(@as(usize, 1), known.master_page_fill_brush_image_payloads.targets.len);
    try std.testing.expect(known.master_page_fill_brush_image_payloads.targets[0].inspection == .png_scanlines);
    try std.testing.expectEqual(@as(?anyerror, null), known.master_page_fill_brush_image_payloads.targets[0].inspection_error);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .master_page_fill_brush_image_payloads = .{ .max_targets = 0 } }));
}

test "HWPX master fill brushes match independent values in a real document" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/[2027] 온새미로 1 본교재.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectMasterPageFillBrushes(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 10), report.master_pages);
    try std.testing.expectEqual(@as(usize, 4), report.brushes.len);
    try std.testing.expectEqual(@as(usize, 4), report.count(.win_brush));
    var face_sum: u64 = 0;
    for (report.nodes) |node| {
        try std.testing.expect(node.kind == .win_brush);
        try std.testing.expect(node.get(.hatch_style) == null);
        const raw = node.get(.face_color) orelse return error.MissingBrushFaceColor;
        if (raw.len != 7 or raw[0] != '#') return error.UnexpectedColorSpelling;
        face_sum += try std.fmt.parseInt(u32, raw[1..], 16);
    }
    try std.testing.expectEqual(@as(u64, 46844616), face_sum);
}
