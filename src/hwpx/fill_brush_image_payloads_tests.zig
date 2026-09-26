const std = @import("std");
const zip = @import("../zip/archive.zig");
const fixture = @import("test_package_fixture.zig");
const manifest = @import("content_manifest.zig");
const links = @import("fill_brush_image_links.zig");
const payloads = @import("fill_brush_image_payloads.zig");
const package = @import("package.zig");

fn item(id: []const u8, href: []const u8, media: []const u8, entry_index: ?usize) manifest.Item {
    return .{ .id = @constCast(id), .href = @constCast(href), .media_type = @constCast(media), .embedded = if (entry_index == null) false else null, .entry_index = entry_index };
}

fn site(state: @import("binary_reference_links.zig").TargetState, item_index: ?usize) links.Site {
    return .{ .brush_index = 0, .node_index = 0, .part_kind = .header, .part_item_index = 0, .section_ordinal = null, .element_index = 0, .target = .{ .state = state, .item_index = item_index } };
}

fn inspectSample(a: std.mem.Allocator, options: payloads.Options, corrupt_png: bool) !payloads.Report {
    return inspectSampleWithArchiveAllocator(a, a, options, corrupt_png);
}

test "HWPX fill brush image payloads share SVG structure and MIME diagnostics" {
    const a = std.testing.allocator;
    const source = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='1'/></svg>";
    const sources = [_]fixture.Source{.{ .name = "BinData/brush.svg", .data = source }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("svg", "BinData/brush.svg", "image/svg", 0)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var sites = [_]links.Site{site(.embedded, 0)};
    const raw: links.Report = .{ .header_and_sections = 1, .master_pages = 0, .sites = &sites, .counts = @splat(0) };
    var report = try payloads.inspect(a, archive, opf, &raw, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.targets.len);
    try std.testing.expectEqual(payloads.Format.svg, report.targets[0].format);
    try std.testing.expectEqual(payloads.Inspection.svg_xml_structure, report.targets[0].inspection);
    try std.testing.expectEqual(@as(?anyerror, null), report.targets[0].inspection_error);
    try std.testing.expectEqual(@as(?bool, false), report.targets[0].media_matches);
    try std.testing.expectEqual(@as(usize, 1), report.media_mismatches);
}

test "HWPX fill brush image payloads opt into shared JPEG RGB" {
    const a = std.testing.allocator;
    const encoded = &@import("../hwp5/container/jpeg_image_fixture.zig").sequential;
    const sources = [_]fixture.Source{.{ .name = "BinData/brush.jpg", .data = encoded }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("jpeg", sources[0].name, "image/jpeg", 0)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var sites = [_]links.Site{site(.embedded, 0)};
    const raw: links.Report = .{ .header_and_sections = 1, .master_pages = 0, .sites = &sites, .counts = @splat(0) };
    var report = try payloads.inspect(a, archive, opf, &raw, .{ .jpeg_pixels = .{} });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), report.jpeg_rgb_bytes);
    try std.testing.expectEqual(payloads.Inspection.jpeg_rgb, report.targets[0].inspection);
    try std.testing.expectEqual(@as(?anyerror, null), report.targets[0].inspection_error);
}

test "HWPX fill brush PNG RGBA counts a shared target once" {
    const a = std.testing.allocator;
    var report = try inspectSample(a, .{ .png_pixels = .{} }, false);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), report.png_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 2), report.png_decoded_bytes);
    try std.testing.expectEqual(@as(usize, 2), report.targets[0].references);
    try std.testing.expectEqual(payloads.Inspection.png_rgba, report.targets[0].inspection);
    try std.testing.expectEqual(@as(?anyerror, null), report.targets[0].inspection_error);
}

fn inspectSampleWithArchiveAllocator(a: std.mem.Allocator, archive_allocator: std.mem.Allocator, options: payloads.Options, corrupt_png: bool) !payloads.Report {
    const png = try @import("../image/png/pixels_fixture.zig").image(a, 0);
    defer a.free(png);
    if (corrupt_png) png[8 + 4 + 4 + 13] ^= 1;
    const sources = [_]fixture.Source{
        .{ .name = "BinData/img.png", .data = png },
        .{ .name = "BinData/unknown.bin", .data = "opaque" },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(archive_allocator, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("png", "BinData/img.png", "image/jpg", 0),
        item("unknown", "BinData/unknown.bin", "image/png", 1),
        item("external", "https://example.invalid/image.png", "image/png", null),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var sites = [_]links.Site{ site(.embedded, 0), site(.embedded, 0), site(.embedded, 1), site(.absent, null), site(.empty, null), site(.missing, null), site(.external, 2) };
    const raw: links.Report = .{ .header_and_sections = 1, .master_pages = 0, .sites = &sites, .counts = @splat(0) };
    return payloads.inspect(a, archive, opf, &raw, options);
}

test "HWPX fill brush image payloads free ZIP bytes with the archive allocator" {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var report = try inspectSampleWithArchiveAllocator(std.testing.allocator, checked.allocator(), .{}, false);
    report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX fill brush image payloads enforce aggregate GIF decode budgets" {
    const a = std.testing.allocator;
    const gif_bytes = try @import("../image/gif/fixtures.zig").literals(a, 2, 1, false);
    defer a.free(gif_bytes);
    const sources = [_]fixture.Source{.{ .name = "BinData/frame.gif", .data = gif_bytes }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("frame", "BinData/frame.gif", "image/gif", 0)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var sites = [_]links.Site{site(.embedded, 0)};
    const raw: links.Report = .{ .header_and_sections = 1, .master_pages = 0, .sites = &sites, .counts = @splat(0) };
    var report = try payloads.inspect(a, archive, opf, &raw, .{});
    try std.testing.expectEqual(@as(usize, 1), report.gif_frames);
    try std.testing.expectEqual(@as(usize, 2), report.gif_indices);
    try std.testing.expect(report.gif_codes > 0);
    const codes = report.gif_codes;
    report.deinit(a);
    var exact = try payloads.inspect(a, archive, opf, &raw, .{ .max_total_gif_indices = 2, .max_total_gif_codes = codes, .max_total_gif_frames = 1 });
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, payloads.inspect(a, archive, opf, &raw, .{ .max_total_gif_indices = 1 }));
    try std.testing.expectError(error.LimitExceeded, payloads.inspect(a, archive, opf, &raw, .{ .max_total_gif_codes = codes - 1 }));
    try std.testing.expectError(error.LimitExceeded, payloads.inspect(a, archive, opf, &raw, .{ .max_total_gif_frames = 0 }));
}

test "HWPX fill brush image payloads reject a forged manifest ZIP binding" {
    const a = std.testing.allocator;
    const sources = [_]fixture.Source{.{ .name = "BinData/actual.png", .data = "opaque" }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("image", "BinData/different.png", "image/png", 0)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var sites = [_]links.Site{site(.embedded, 0)};
    const raw: links.Report = .{ .header_and_sections = 1, .master_pages = 0, .sites = &sites, .counts = @splat(0) };
    try std.testing.expectError(error.InvalidManifestEntryIndex, payloads.inspect(a, archive, opf, &raw, .{}));
}

test "HWPX fill brush image payloads decode unique targets and preserve media disagreement" {
    const a = std.testing.allocator;
    var report = try inspectSample(a, .{}, false);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 7), report.sites);
    try std.testing.expectEqual(@as(usize, 4), report.non_embedded_sites);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 2), report.targets[0].references);
    try std.testing.expect(report.targets[0].format == .png and report.targets[0].media_matches == false);
    try std.testing.expect(report.targets[0].inspection == .png_scanlines);
    try std.testing.expect(report.targets[1].format == .unknown and report.targets[1].media_matches == null);
    try std.testing.expect(report.targets[1].inspection == .unsupported);
    try std.testing.expectEqual(@as(usize, 1), report.media_mismatches);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_formats);
    try std.testing.expect(report.encoded_bytes > 0);
    try std.testing.expect(report.png_decoded_bytes > 0);
}

test "HWPX fill brush image payloads enforce unique and byte budgets" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_targets = 1 }, false));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_entry_bytes = 0 }, false));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_total_encoded_bytes = 0 }, false));
    var exact = try inspectSample(a, .{ .max_targets = 2 }, false);
    const entry_bytes = exact.targets[0].encoded_bytes;
    const total_bytes = exact.encoded_bytes;
    const png_decoded = exact.png_decoded_bytes;
    exact.deinit(a);
    var exact_bytes = try inspectSample(a, .{ .max_entry_bytes = entry_bytes, .max_total_encoded_bytes = total_bytes, .max_total_png_decoded_bytes = png_decoded }, false);
    exact_bytes.deinit(a);
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_entry_bytes = entry_bytes - 1 }, false));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_total_encoded_bytes = total_bytes - 1 }, false));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_total_png_decoded_bytes = png_decoded - 1 }, false));
}

test "HWPX fill brush image payloads diagnose a PNG checksum fault inside a valid ZIP" {
    const a = std.testing.allocator;
    var report = try inspectSample(a, .{}, true);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
    try std.testing.expectEqual(@as(?anyerror, error.InvalidChecksum), report.targets[0].inspection_error);
    try std.testing.expectEqual(@as(?anyerror, null), report.targets[1].inspection_error);
}

test "HWPX fill brush image payloads clean all allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspectSample(a, .{}, false);
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 2), report.targets.len);
            var damaged = try inspectSample(a, .{}, true);
            defer damaged.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), damaged.inspection_failures);
        }
    }.run, .{});
}

test "HWPX fill brush image payloads connect a tracked document and fail late safely" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/borderfill.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), known.fill_brush_image_links.sites.len);
    try std.testing.expectEqual(@as(usize, 1), known.fill_brush_image_payloads.targets.len);
    try std.testing.expectEqual(@as(usize, 3), known.fill_brush_image_payloads.targets[0].references);
    try std.testing.expect(known.fill_brush_image_payloads.targets[0].format != .unknown);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .fill_brush_image_payloads = .{ .max_targets = 0 } }));
}
