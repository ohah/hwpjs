const std = @import("std");
const zip = @import("../zip/archive.zig");
const fixture = @import("test_package_fixture.zig");
const manifest = @import("content_manifest.zig");
const payloads = @import("manifest_image_payloads.zig");
const package = @import("package.zig");
const bmp_fixture = @import("../image/bmp/test_fixture.zig");
const image_core = @import("image_payloads.zig");
const jpeg_fixture = @import("../hwp5/container/jpeg_image_fixture.zig");

fn item(id: []const u8, href: []const u8, media: []const u8, entry_index: ?usize) manifest.Item {
    return .{ .id = @constCast(id), .href = @constCast(href), .media_type = @constCast(media), .embedded = if (entry_index == null) false else null, .entry_index = entry_index };
}

fn inspectSample(a: std.mem.Allocator, options: payloads.Options) !payloads.Report {
    const sources = [_]fixture.Source{
        .{ .name = "BinData/unused.svg", .data = "<svg xmlns='http://www.w3.org/2000/svg'/>" },
        .{ .name = "BinData/broken.svg", .data = "<wrong xmlns='http://www.w3.org/2000/svg'/>" },
        .{ .name = "BinData/other.bin", .data = "opaque" },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("unused", "BinData/unused.svg", "application/octet-stream", 0),
        item("broken", "BinData/broken.svg", "image/svg+xml", 1),
        item("other", "BinData/other.bin", "application/octet-stream", 2),
        item("external", "https://example.invalid/outside.png", "image/png", null),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return payloads.inspect(a, archive, opf, options);
}

test "HWPX manifest image payloads include unreferenced candidates and retain failures" {
    const a = std.testing.allocator;
    try std.testing.expect(payloads.isCandidate(item("upper", "BinData/blob.bin", "IMAGE/PNG", null)));
    try std.testing.expect(!payloads.isCandidate(item("other", "BinData/blob.bin", "application/octet-stream", null)));
    var report = try inspectSample(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), report.sites);
    try std.testing.expectEqual(@as(usize, 1), report.non_embedded_sites);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 0), report.targets[0].item_index);
    try std.testing.expectEqual(@as(usize, 1), report.targets[1].item_index);
    try std.testing.expectEqual(@as(?anyerror, null), report.targets[0].inspection_error);
    try std.testing.expect(report.targets[1].inspection_error != null);
    try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
    try std.testing.expectEqual(@as(usize, 1), report.media_mismatches);
    try std.testing.expectEqual(@as(usize, 0), report.unknown_formats);
    var exact = try inspectSample(a, .{ .max_targets = 2 });
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_targets = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspectSample(a, .{ .max_total_encoded_bytes = 1 }));
}

test "HWPX manifest image payloads release every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspectSample(a, .{});
            report.deinit(a);
        }
    }.run, .{});
}

test "HWPX manifest image payloads inspect tracked SVG document" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue3460/svg_picture_repro.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestImagePayloads(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.sites);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 0), report.inspection_failures);
    try std.testing.expectEqual(@as(usize, 2), report.media_mismatches);
}

test "HWPX manifest image payloads do not charge external items to target limit" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &.{});
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("external", "https://example.invalid/absent.png", "image/png", null)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var report = try payloads.inspect(a, archive, opf, .{ .max_targets = 0 });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.sites);
    try std.testing.expectEqual(@as(usize, 1), report.non_embedded_sites);
    try std.testing.expectEqual(@as(usize, 0), report.targets.len);
}

test "HWPX manifest image payloads retain distinct OPF declarations sharing a ZIP entry" {
    const a = std.testing.allocator;
    const sources = [_]fixture.Source{.{ .name = "BinData/shared.svg", .data = "<svg xmlns='http://www.w3.org/2000/svg'/>" }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("standard", "BinData/shared.svg", "image/svg+xml", 0),
        item("nonstandard", "BinData/shared.svg", "image/svg", 0),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var report = try payloads.inspect(a, archive, opf, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.targets.len);
    try std.testing.expectEqual(@as(usize, 1), report.media_mismatches);
    try std.testing.expectEqual(@as(?bool, true), report.targets[0].media_matches);
    try std.testing.expectEqual(@as(?bool, false), report.targets[1].media_matches);
    try std.testing.expectEqual(@as(usize, 0), report.inspection_failures);
}

fn bmpSample(a: std.mem.Allocator, invalid_index: bool, options: payloads.Options) !payloads.Report {
    var indexed = bmp_fixture.indexed();
    if (invalid_index) indexed[62] = 2;
    const sources = [_]fixture.Source{
        .{ .name = "BinData/plain.bmp", .data = &bmp_fixture.plain },
        .{ .name = "BinData/indexed.bmp", .data = &indexed },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("plain", sources[0].name, "image/bmp", 0),
        item("indexed", sources[1].name, "image/bmp", 1),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return payloads.inspect(a, archive, opf, options);
}

test "HWPX manifest BMP pixels distinguish structure from RGBA validation" {
    const a = std.testing.allocator;
    var valid = try bmpSample(a, false, .{});
    defer valid.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), valid.targets.len);
    try std.testing.expectEqual(@as(usize, 20), valid.bmp_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 0), valid.inspection_failures);
    try std.testing.expectEqual(image_core.Inspection.bmp_rgba, valid.targets[0].inspection);
    var malformed = try bmpSample(a, true, .{});
    defer malformed.deinit(a);
    try std.testing.expectEqual(@as(usize, 16), malformed.bmp_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 1), malformed.inspection_failures);
    try std.testing.expectEqual(error.InvalidBmpPaletteIndex, malformed.targets[1].inspection_error.?);
    var structure_only = try bmpSample(a, true, .{ .bmp_pixels = null, .max_total_bmp_rgba_bytes = 0 });
    defer structure_only.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), structure_only.bmp_rgba_bytes);
    try std.testing.expectEqual(@as(usize, 0), structure_only.inspection_failures);
    try std.testing.expectEqual(image_core.Inspection.bmp_structure, structure_only.targets[1].inspection);
    try std.testing.expectError(error.LimitExceeded, bmpSample(a, false, .{ .max_total_bmp_rgba_bytes = 19 }));
    try std.testing.expectError(error.LimitExceeded, bmpSample(a, false, .{ .bmp = .{ .max_bytes = 69 } }));
    try std.testing.expectError(error.LimitExceeded, bmpSample(a, false, .{ .bmp_pixels = .{ .max_rgba_bytes = 15 } }));
}

test "HWPX manifest BMP RGBA path releases every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try bmpSample(a, false, .{});
            report.deinit(a);
        }
    }.run, .{});
}

fn jpegSample(a: std.mem.Allocator, options: payloads.Options) !payloads.Report {
    const sources = [_]fixture.Source{
        .{ .name = "BinData/sequential.jpg", .data = &jpeg_fixture.sequential },
        .{ .name = "BinData/progressive.jpg", .data = &jpeg_fixture.progressive },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("sequential", sources[0].name, "image/jpeg", 0),
        item("progressive", sources[1].name, "image/jpeg", 1),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return payloads.inspect(a, archive, opf, options);
}

fn jpegSampleRaw(a: std.mem.Allocator, raw: []const u8, options: payloads.Options) !payloads.Report {
    const sources = [_]fixture.Source{.{ .name = "BinData/image.jpg", .data = raw }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("image", sources[0].name, "image/jpeg", 0)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return payloads.inspect(a, archive, opf, options);
}

test "HWPX manifest JPEG pixels are explicit and share one RGB budget" {
    const a = std.testing.allocator;
    var framing = try jpegSample(a, .{ .max_total_jpeg_rgb_bytes = 0 });
    defer framing.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), framing.jpeg_rgb_bytes);
    try std.testing.expectEqual(@as(usize, 0), framing.inspection_failures);
    try std.testing.expectEqual(image_core.Inspection.jpeg_framing, framing.targets[0].inspection);
    var decoded = try jpegSample(a, .{ .jpeg_pixels = .{} });
    defer decoded.deinit(a);
    try std.testing.expectEqual(@as(usize, 6), decoded.jpeg_rgb_bytes);
    try std.testing.expectEqual(@as(usize, 0), decoded.inspection_failures);
    try std.testing.expectEqual(image_core.Inspection.jpeg_rgb, decoded.targets[0].inspection);
    try std.testing.expectEqual(image_core.Inspection.jpeg_rgb, decoded.targets[1].inspection);
    try std.testing.expectError(error.LimitExceeded, jpegSample(a, .{ .jpeg_pixels = .{}, .max_total_jpeg_rgb_bytes = 5 }));
    try std.testing.expectError(error.LimitExceeded, jpegSample(a, .{ .jpeg_pixels = .{ .render = .{ .upsampling = .nearest, .colour_management = .unmanaged, .max_rgb_bytes = 2 } } }));
    try std.testing.expectError(error.LimitExceeded, jpegSample(a, .{ .jpeg_pixels = .{ .max_samples = 0 } }));
    try std.testing.expectError(error.LimitExceeded, jpegSample(a, .{ .jpeg_pixels = .{}, .jpeg = .{ .max_scans = 0 } }));
}

test "HWPX manifest JPEG zero-based component IDs require opt-in and remain visible" {
    const a = std.testing.allocator;
    const jfif = [_]u8{ 255, 224, 0, 16 } ++ "JFIF\x00".* ++ .{ 1, 2, 0, 0, 1, 0, 1, 0, 0 };
    const adobe = [_]u8{ 255, 238, 0, 14 } ++ "Adobe".* ++ .{ 0, 100, 0, 0, 0, 0, 1 };
    const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
    const h = [_]u8{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
    const frame = [_]u8{ 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 0, 17, 0, 1, 17, 0, 2, 17, 0 };
    const scan = [_]u8{ 255, 218, 0, 12, 3, 0, 0, 1, 0, 2, 0, 0, 63, 0, 0x49, 0x7f, 255, 217 };
    const raw = [_]u8{ 255, 216 } ++ jfif ++ adobe ++ q ++ h ++ frame ++ scan;
    var strict = try jpegSampleRaw(a, &raw, .{ .jpeg_pixels = .{} });
    defer strict.deinit(a);
    try std.testing.expectEqual(error.InvalidJfifComponentId, strict.targets[0].inspection_error.?);
    try std.testing.expectEqual(@as(usize, 0), strict.jpeg_rgb_bytes);
    try std.testing.expect(!strict.targets[0].observed_zero_based_jpeg_component_ids);

    const selected: payloads.Options = .{ .jpeg_pixels = .{ .render = .{ .upsampling = .nearest, .colour_management = .unmanaged, .component_ids = .observed_zero_based_three } } };
    var accepted = try jpegSampleRaw(a, &raw, selected);
    defer accepted.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), accepted.targets[0].inspection_error);
    try std.testing.expectEqual(@as(usize, 3), accepted.jpeg_rgb_bytes);
    try std.testing.expect(accepted.targets[0].observed_zero_based_jpeg_component_ids);
    try std.testing.expectError(error.LimitExceeded, jpegSampleRaw(a, &raw, .{ .jpeg_pixels = selected.jpeg_pixels, .max_total_jpeg_rgb_bytes = 2 }));

    var canonical = raw;
    const sof_at = std.mem.indexOf(u8, &canonical, &.{ 255, 192 }).?;
    const sos_at = std.mem.indexOf(u8, &canonical, &.{ 255, 218 }).?;
    for ([_]usize{ 10, 13, 16 }) |offset| canonical[sof_at + offset] += 1;
    for ([_]usize{ 5, 7, 9 }) |offset| canonical[sos_at + offset] += 1;
    var ordinary = try jpegSampleRaw(a, &canonical, selected);
    defer ordinary.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), ordinary.targets[0].inspection_error);
    try std.testing.expect(!ordinary.targets[0].observed_zero_based_jpeg_component_ids);
    var malformed = raw;
    malformed[sof_at + 16] = 3;
    malformed[sos_at + 9] = 3;
    var rejected = try jpegSampleRaw(a, &malformed, selected);
    defer rejected.deinit(a);
    try std.testing.expectEqual(error.InvalidJfifComponentId, rejected.targets[0].inspection_error.?);
    try std.testing.expect(!rejected.targets[0].observed_zero_based_jpeg_component_ids);

    var conflicting = raw;
    conflicting[std.mem.indexOf(u8, &conflicting, "Adobe").? + 11] = 0;
    var colour_error = try jpegSampleRaw(a, &conflicting, selected);
    defer colour_error.deinit(a);
    try std.testing.expectEqual(error.ConflictingJfifAdobeColour, colour_error.targets[0].inspection_error.?);
    var corrupt = raw;
    corrupt[corrupt.len - 3] &= 0xfe;
    var entropy_error = try jpegSampleRaw(a, &corrupt, selected);
    defer entropy_error.deinit(a);
    try std.testing.expectEqual(error.InvalidJpegEntropyPadding, entropy_error.targets[0].inspection_error.?);

    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, jpeg_bytes: []const u8, options: payloads.Options) !void {
            var report = try jpegSampleRaw(allocator, jpeg_bytes, options);
            report.deinit(allocator);
        }
    }.run, .{ @as([]const u8, &raw), selected });
}

test "HWPX manifest Exif Adobe JPEG pixels require declared colour and keep errors" {
    const a = std.testing.allocator;
    const exif = [_]u8{ 255, 225, 0, 8 } ++ "Exif\x00\x00".*;
    const adobe = [_]u8{ 255, 238, 0, 14 } ++ "Adobe".* ++ .{ 0, 100, 0, 0, 0, 0, 0 };
    const suffix = jpeg_fixture.sequential[20..].*;
    const raw = jpeg_fixture.sequential[0..2].* ++ exif ++ adobe ++ suffix;
    var strict = try jpegSampleRaw(a, &raw, .{ .jpeg_pixels = .{} });
    defer strict.deinit(a);
    try std.testing.expectEqual(error.MissingJfifHeader, strict.targets[0].inspection_error.?);
    try std.testing.expect(!strict.targets[0].jpeg_exif_adobe_colour);

    const selected: payloads.Options = .{ .jpeg_pixels = .{ .exif_adobe_colour = true } };
    var accepted = try jpegSampleRaw(a, &raw, selected);
    defer accepted.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), accepted.targets[0].inspection_error);
    try std.testing.expectEqual(@as(usize, 3), accepted.jpeg_rgb_bytes);
    try std.testing.expect(accepted.targets[0].jpeg_exif_adobe_colour);
    try std.testing.expect(!accepted.targets[0].observed_zero_based_jpeg_component_ids);
    var ordinary_jfif = try jpegSampleRaw(a, &jpeg_fixture.sequential, selected);
    defer ordinary_jfif.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), ordinary_jfif.targets[0].inspection_error);
    try std.testing.expect(!ordinary_jfif.targets[0].jpeg_exif_adobe_colour);

    var missing = try jpegSampleRaw(a, &(jpeg_fixture.sequential[0..2].* ++ exif ++ suffix), selected);
    defer missing.deinit(a);
    try std.testing.expectEqual(error.MissingAdobeColourDeclaration, missing.targets[0].inspection_error.?);
    var conflicting = raw;
    conflicting[std.mem.indexOf(u8, &conflicting, "Adobe").? + 11] = 1;
    var conflict = try jpegSampleRaw(a, &conflicting, selected);
    defer conflict.deinit(a);
    try std.testing.expectEqual(error.UnsupportedExifAdobeColour, conflict.targets[0].inspection_error.?);
    var wrong_print_id = raw;
    wrong_print_id[std.mem.indexOf(u8, &wrong_print_id, "Adobe").? + 5] = 1;
    var print_error = try jpegSampleRaw(a, &wrong_print_id, selected);
    defer print_error.deinit(a);
    try std.testing.expectEqual(error.InvalidPrintAdobeIdentifier, print_error.targets[0].inspection_error.?);
    var invalid_identifier = raw;
    invalid_identifier[std.mem.indexOf(u8, &invalid_identifier, "Exif").? + 2] ^= 1;
    var not_exif = try jpegSampleRaw(a, &invalid_identifier, selected);
    defer not_exif.deinit(a);
    try std.testing.expectEqual(error.MissingJfifHeader, not_exif.targets[0].inspection_error.?);
    var duplicate = try jpegSampleRaw(a, &(jpeg_fixture.sequential[0..2].* ++ exif ++ exif ++ adobe ++ suffix), selected);
    defer duplicate.deinit(a);
    try std.testing.expectEqual(error.DuplicateExifHeader, duplicate.targets[0].inspection_error.?);
    var invalid_entropy = raw;
    invalid_entropy[invalid_entropy.len - 3] &= 0xfe;
    var entropy = try jpegSampleRaw(a, &invalid_entropy, selected);
    defer entropy.deinit(a);
    try std.testing.expectEqual(error.InvalidJpegEntropyPadding, entropy.targets[0].inspection_error.?);
    const progressive_exif = jpeg_fixture.progressive[0..2].* ++ exif ++ adobe ++ jpeg_fixture.progressive[20..].*;
    var progressive_ok = try jpegSampleRaw(a, &progressive_exif, selected);
    defer progressive_ok.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), progressive_ok.targets[0].inspection_error);
    try std.testing.expect(progressive_ok.targets[0].jpeg_exif_adobe_colour);
    try std.testing.expectEqual(@as(usize, 3), progressive_ok.jpeg_rgb_bytes);
    const partial_exif = jpeg_fixture.partial[0..2].* ++ exif ++ adobe ++ jpeg_fixture.partial[20..].*;
    var partial = try jpegSampleRaw(a, &partial_exif, selected);
    defer partial.deinit(a);
    try std.testing.expectEqual(error.IncompleteJpegProgressiveCoefficients, partial.targets[0].inspection_error.?);
    try std.testing.expectError(error.LimitExceeded, jpegSampleRaw(a, &raw, .{ .jpeg_pixels = selected.jpeg_pixels, .max_total_jpeg_rgb_bytes = 2 }));
    try std.testing.expectError(error.LimitExceeded, jpegSampleRaw(a, &raw, .{ .jpeg_pixels = .{ .exif_adobe_colour = true, .max_samples = 0 } }));
    try std.testing.expectError(error.LimitExceeded, jpegSampleRaw(a, &raw, .{ .jpeg_pixels = .{ .exif_adobe_colour = true, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged, .max_adobe_markers = 0 } } }));
    for (2..raw.len) |length| {
        var truncated = try jpegSampleRaw(a, raw[0..length], selected);
        defer truncated.deinit(a);
        try std.testing.expect(truncated.targets[0].inspection_error != null);
        try std.testing.expect(!truncated.targets[0].jpeg_exif_adobe_colour);
    }

    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, jpeg_bytes: []const u8, options: payloads.Options) !void {
            var report = try jpegSampleRaw(allocator, jpeg_bytes, options);
            report.deinit(allocator);
        }
    }.run, .{ @as([]const u8, &raw), selected });
}

test "HWPX manifest Exif TIFF orientation is separately inspected without rotating pixels" {
    const a = std.testing.allocator;
    const exif = [_]u8{ 255, 225, 0, 34 } ++ "Exif\x00\x00".* ++ "II".* ++ .{ 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0 };
    const adobe = [_]u8{ 255, 238, 0, 14 } ++ "Adobe".* ++ .{ 0, 100, 0, 0, 0, 0, 0 };
    const raw = jpeg_fixture.sequential[0..2].* ++ exif ++ adobe ++ jpeg_fixture.sequential[20..].*;
    var deferred = try jpegSampleRaw(a, &raw, .{ .jpeg_pixels = .{ .exif_adobe_colour = true } });
    defer deferred.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), deferred.targets[0].inspection_error);
    try std.testing.expect(!deferred.targets[0].jpeg_exif_orientation_inspected);
    try std.testing.expectEqual(@as(?u8, null), deferred.targets[0].jpeg_exif_orientation);

    var framing = try jpegSampleRaw(a, &raw, .{ .jpeg_exif_orientation = .{} });
    defer framing.deinit(a);
    try std.testing.expectEqual(image_core.Inspection.jpeg_framing, framing.targets[0].inspection);
    try std.testing.expectEqual(@as(usize, 0), framing.jpeg_rgb_bytes);
    try std.testing.expect(framing.targets[0].jpeg_exif_orientation_inspected);
    try std.testing.expectEqual(@as(?u8, 6), framing.targets[0].jpeg_exif_orientation);

    const selected: payloads.Options = .{ .jpeg_pixels = .{ .exif_adobe_colour = true }, .jpeg_exif_orientation = .{} };
    var checked = try jpegSampleRaw(a, &raw, selected);
    defer checked.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), checked.targets[0].inspection_error);
    try std.testing.expect(checked.targets[0].jpeg_exif_adobe_colour);
    try std.testing.expect(checked.targets[0].jpeg_exif_orientation_inspected);
    try std.testing.expectEqual(@as(?u8, 6), checked.targets[0].jpeg_exif_orientation);
    try std.testing.expectEqual(@as(usize, 3), checked.jpeg_rgb_bytes);
    const without_adobe = jpeg_fixture.sequential[0..2].* ++ exif ++ jpeg_fixture.sequential[20..].*;
    var colour_rejected = try jpegSampleRaw(a, &without_adobe, selected);
    defer colour_rejected.deinit(a);
    try std.testing.expectEqual(error.MissingAdobeColourDeclaration, colour_rejected.targets[0].inspection_error.?);
    try std.testing.expect(colour_rejected.targets[0].jpeg_exif_orientation_inspected);
    try std.testing.expectEqual(@as(?u8, 6), colour_rejected.targets[0].jpeg_exif_orientation);
    try std.testing.expectEqual(@as(usize, 1), colour_rejected.inspection_failures);
    try std.testing.expectEqual(@as(usize, 0), colour_rejected.jpeg_exif_orientation_failures);
    var jfif = try jpegSampleRaw(a, &jpeg_fixture.sequential, selected);
    defer jfif.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), jfif.targets[0].inspection_error);
    try std.testing.expect(!jfif.targets[0].jpeg_exif_orientation_inspected);

    var invalid = raw;
    invalid[2 + 4 + 24] = 9;
    var rejected = try jpegSampleRaw(a, &invalid, selected);
    defer rejected.deinit(a);
    try std.testing.expectEqual(@as(?anyerror, null), rejected.targets[0].inspection_error);
    try std.testing.expectEqual(error.InvalidExifOrientation, rejected.targets[0].jpeg_exif_orientation_error.?);
    try std.testing.expect(!rejected.targets[0].jpeg_exif_orientation_inspected);
    try std.testing.expectEqual(@as(?u8, null), rejected.targets[0].jpeg_exif_orientation);
    try std.testing.expectEqual(@as(usize, 0), rejected.inspection_failures);
    try std.testing.expectEqual(@as(usize, 1), rejected.jpeg_exif_orientation_failures);
    try std.testing.expectError(error.LimitExceeded, jpegSampleRaw(a, &raw, .{ .jpeg_exif_orientation = .{ .max_fields = 0 } }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, jpeg_bytes: []const u8, options: payloads.Options) !void {
            var report = try jpegSampleRaw(allocator, jpeg_bytes, options);
            report.deinit(allocator);
        }
    }.run, .{ @as([]const u8, &raw), selected });
}

test "HWPX manifest JPEG RGB path releases every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try jpegSample(a, .{ .jpeg_pixels = .{} });
            report.deinit(a);
        }
    }.run, .{});
}

test "HWPX manifest JPEG pixel errors remain target diagnostics" {
    const a = std.testing.allocator;
    var broken = jpeg_fixture.sequential;
    broken[broken.len - 3] &= 0xfe;
    var framing = try jpegSampleRaw(a, &broken, .{});
    defer framing.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), framing.inspection_failures);
    var pixels = try jpegSampleRaw(a, &broken, .{ .jpeg_pixels = .{} });
    defer pixels.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), pixels.inspection_failures);
    try std.testing.expectEqual(error.InvalidJpegEntropyPadding, pixels.targets[0].inspection_error.?);
    try std.testing.expectEqual(@as(usize, 0), pixels.jpeg_rgb_bytes);
    var arithmetic = jpeg_fixture.progressive;
    const at = std.mem.indexOf(u8, &arithmetic, &.{ 255, 194 }).?;
    arithmetic[at + 1] = 202;
    var unsupported = try jpegSampleRaw(a, &arithmetic, .{ .jpeg_pixels = .{} });
    defer unsupported.deinit(a);
    try std.testing.expectEqual(error.UnsupportedJpegProcess, unsupported.targets[0].inspection_error.?);
    var partial = try jpegSampleRaw(a, &jpeg_fixture.partial, .{ .jpeg_pixels = .{} });
    defer partial.deinit(a);
    try std.testing.expectEqual(error.IncompleteJpegProgressiveCoefficients, partial.targets[0].inspection_error.?);
    try std.testing.expectEqual(@as(usize, 0), partial.jpeg_rgb_bytes);
}
