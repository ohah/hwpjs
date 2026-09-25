const std = @import("std");
const zip = @import("../zip/archive.zig");
const fixture = @import("test_package_fixture.zig");
const manifest = @import("content_manifest.zig");
const links = @import("picture_image_links.zig");
const payloads = @import("picture_image_payloads.zig");
const package = @import("package.zig");

fn item(id: []const u8, href: []const u8, media: []const u8, entry_index: ?usize) manifest.Item {
    return .{ .id = @constCast(id), .href = @constCast(href), .media_type = @constCast(media), .embedded = if (entry_index == null) false else null, .entry_index = entry_index };
}

fn site(id: ?[]const u8, state: @import("binary_reference_links.zig").TargetState, item_index: ?usize) links.Site {
    return .{ .part_kind = .section, .part_item_index = 0, .section_ordinal = 0, .picture_element_index = 0, .image_element_index = 1, .id = if (id) |value| @constCast(value) else null, .target = .{ .state = state, .item_index = item_index } };
}

fn inspectSample(a: std.mem.Allocator, options: payloads.Options, corrupt_png: bool, wrong_id: bool) !payloads.Report {
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 0);
    defer a.free(png);
    if (corrupt_png) png[8 + 4 + 4 + 13] ^= 1;
    const sources = [_]fixture.Source{ .{ .name = "BinData/img.png", .data = png }, .{ .name = "BinData/unknown.bin", .data = "opaque" } };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("png", "BinData/img.png", "image/jpg", 0),
        item("unknown", "BinData/unknown.bin", "image/png", 1),
        item("external", "https://example.invalid/image.png", "image/png", null),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var sites = [_]links.Site{
        site(if (wrong_id) "wrong" else "png", .embedded, 0),
        site("png", .embedded, 0),
        site("unknown", .embedded, 1),
        site(null, .absent, null),
        site("", .empty, null),
        site("missing", .missing, null),
        site("external", .external, 2),
    };
    const raw: links.Report = .{ .sections = 1, .master_pages = 0, .sites = &sites, .counts = @splat(0) };
    return payloads.inspect(a, archive, opf, &raw, options);
}

test "HWPX picture image payloads decode unique targets without fetching external sites" {
    const a = std.testing.allocator;
    var report = try inspectSample(a, .{}, false, false);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 7), report.sites);
    try std.testing.expectEqual(@as(usize, 4), report.non_embedded_sites);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 2), report.targets[0].references);
    try std.testing.expect(report.targets[0].format == .png and report.targets[0].inspection == .png_scanlines);
    try std.testing.expect(report.targets[1].format == .unknown and report.targets[1].inspection == .unsupported);
    try std.testing.expectEqual(@as(usize, 1), report.media_mismatches);
    try std.testing.expectEqual(@as(?bool, null), report.targets[1].media_matches);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_formats);
    try std.testing.expectEqual(@as(usize, 0), report.inspection_failures);
}

test "HWPX picture image payloads preserve inner PNG error and reject forged IDs" {
    const a = std.testing.allocator;
    var report = try inspectSample(a, .{}, true, false);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
    try std.testing.expectEqual(@as(?anyerror, error.InvalidChecksum), report.targets[0].inspection_error);
    try std.testing.expectError(error.InvalidImageLinkReport, inspectSample(a, .{}, false, true));
}

test "HWPX picture image payloads propagate ZIP CRC failure before format diagnostics" {
    const a = std.testing.allocator;
    const name = "BinData/img.png";
    const sources = [_]fixture.Source{.{ .name = name, .data = "opaque" }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    bytes[30 + name.len] ^= 1;
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("img", name, "image/png", 0)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var sites = [_]links.Site{site("img", .embedded, 0)};
    const raw: links.Report = .{ .sections = 1, .master_pages = 0, .sites = &sites, .counts = @splat(0) };
    try std.testing.expectError(error.InvalidCrc, payloads.inspect(a, archive, opf, &raw, .{}));
    sites[0].target.state = .external;
    try std.testing.expectError(error.InvalidImageLinkReport, payloads.inspect(a, archive, opf, &raw, .{}));
    sites[0].target = .{ .state = .missing };
    try std.testing.expectError(error.InvalidImageLinkReport, payloads.inspect(a, archive, opf, &raw, .{}));
}

test "HWPX picture image payloads enforce exact target and byte budgets" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_targets = 1 }, false, false));
    var measured = try inspectSample(a, .{}, false, false);
    const entry_bytes = measured.targets[0].encoded_bytes;
    const total_bytes = measured.encoded_bytes;
    const png_decoded = measured.png_decoded_bytes;
    measured.deinit(a);
    var exact = try inspectSample(a, .{ .max_targets = 2, .max_entry_bytes = entry_bytes, .max_total_encoded_bytes = total_bytes, .max_total_png_decoded_bytes = png_decoded }, false, false);
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_entry_bytes = entry_bytes - 1 }, false, false));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_total_encoded_bytes = total_bytes - 1 }, false, false));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_total_png_decoded_bytes = png_decoded - 1 }, false, false));
}

test "HWPX picture image payloads release every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var valid = try inspectSample(a, .{}, false, false);
            defer valid.deinit(a);
            var damaged = try inspectSample(a, .{}, true, false);
            defer damaged.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), damaged.inspection_failures);
        }
    }.run, .{});
}

test "HWPX picture image payloads inspect a tracked picture document" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectPictureImagePayloads(a, .{}, .{});
    defer report.deinit(a);
    try std.testing.expect(report.sites > 0 and report.targets.len > 0);
    try std.testing.expectEqual(@as(usize, 0), report.unknown_formats);
    try std.testing.expectError(error.LimitExceeded, document.inspectPictureImagePayloads(a, .{}, .{ .max_targets = 0 }));
}

test "HWPX picture image payloads connect section and master known reports" {
    const a = std.testing.allocator;
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 0);
    defer a.free(png);
    const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
        "<o:item id='img' href='BinData/img.png' media-type='image/png'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:pic><c:img binaryItemIDRef='img'/></p:pic></s:sec>" },
        .{ .name = "Contents/masterpage0.xml", .data = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:pic><c:img binaryItemIDRef='img'/></p:pic></masterPage>" },
        .{ .name = "BinData/img.png", .data = png },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), known.picture_image_payloads.targets.len);
    try std.testing.expectEqual(@as(usize, 1), known.master_page_picture_image_payloads.targets.len);
    try std.testing.expectEqual(@as(usize, 1), known.picture_image_payloads.targets[0].references);
    try std.testing.expect(known.picture_image_payloads.targets[0].inspection == .png_scanlines);
    try std.testing.expectEqual(@as(usize, 0), known.picture_image_payloads.inspection_failures + known.master_page_picture_image_payloads.inspection_failures);
    var standalone = try document.inspectMasterPagePictureImagePayloads(a, .{}, .{});
    defer standalone.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), standalone.targets.len);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .picture_image_payloads = .{ .max_targets = 0 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .master_page_picture_image_payloads = .{ .max_targets = 0 } }));
}
