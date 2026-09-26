const std = @import("std");
const package = @import("hwpx/package.zig");
const jpeg = @import("image/jpeg/structure.zig");

const expected_candidates = [_]usize{ 46, 30, 107, 69, 43, 28, 28, 469 };
// Product baselines; candidate and marker categories are independently
// observable in tools/hwpx-fill-brush-image-oracle.py --jpeg-readiness.
const expected_decoded = [_]usize{ 43, 29, 104, 37, 38, 25, 25, 414 };
const expected_rgb_bytes = [_]usize{ 101606592, 28583646, 172156164, 19000572, 63634479, 28763508, 25679073, 47631684 };
const expected_missing_jfif = [_]usize{ 3, 1, 1, 0, 5, 3, 3, 18 };
const expected_invalid_marker = [_]usize{ 0, 0, 2, 0, 0, 0, 0, 11 };
const expected_invalid_ids = [_]usize{ 0, 0, 0, 31, 0, 0, 0, 2 };
const expected_conflicting_colour = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 24 };
const expected_duplicate_jfif = [_]usize{ 0, 0, 0, 1, 0, 0, 0, 0 };

const Stats = struct {
    documents: usize = 0,
    candidates: usize = 0,
    decoded: usize = 0,
    failed: usize = 0,
    rgb_bytes: usize = 0,
    missing_jfif: usize = 0,
    invalid_marker: usize = 0,
    invalid_ids: usize = 0,
    conflicting_colour: usize = 0,
    duplicate_jfif: usize = 0,
};

fn survey(shard: usize) !Stats {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var stats: Stats = .{};
    for (roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            var path_sum: usize = root_index;
            for (entry.path) |byte| path_sum += byte;
            if (path_sum % 8 != shard) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                if (err == error.MissingEndRecord) continue;
                return err;
            };
            defer document.deinit(a);
            var protection = try document.inspectProtection(a, .{});
            defer protection.deinit(a);
            if (protection.encrypted_paths.len != 0) continue;
            stats.documents += 1;
            var report = try document.inspectManifestImagePayloads(a, .{
                .jpeg_pixels = .{},
                .max_total_jpeg_rgb_bytes = 2 * 1024 * 1024 * 1024,
            });
            defer report.deinit(a);
            var successful_bytes: usize = 0;
            for (report.targets) |target| {
                if (target.format != .jpeg) continue;
                stats.candidates += 1;
                try std.testing.expectEqual(@import("hwpx/image_payloads.zig").Inspection.jpeg_rgb, target.inspection);
                if (target.inspection_error) |err| {
                    stats.failed += 1;
                    switch (err) {
                        error.MissingJfifHeader => stats.missing_jfif += 1,
                        error.InvalidJpegMarker => stats.invalid_marker += 1,
                        error.InvalidJfifComponentId => stats.invalid_ids += 1,
                        error.ConflictingJfifAdobeColour => stats.conflicting_colour += 1,
                        error.DuplicateJfifHeader => stats.duplicate_jfif += 1,
                        else => return err,
                    }
                    continue;
                }
                stats.decoded += 1;
                const encoded = try document.archive.decode(document.archive.entries[target.entry_index], 64 * 1024 * 1024);
                defer document.archive.allocator.free(encoded);
                const shape = try jpeg.inspect(encoded, .{});
                successful_bytes += @as(usize, shape.width) * shape.effective_height * 3;
            }
            try std.testing.expectEqual(successful_bytes, report.jpeg_rgb_bytes);
            stats.rgb_bytes += report.jpeg_rgb_bytes;
        }
    }
    try std.testing.expectEqual(expected_candidates[shard], stats.candidates);
    try std.testing.expectEqual(expected_decoded[shard], stats.decoded);
    try std.testing.expectEqual(expected_rgb_bytes[shard], stats.rgb_bytes);
    try std.testing.expectEqual(expected_missing_jfif[shard], stats.missing_jfif);
    try std.testing.expectEqual(expected_invalid_marker[shard], stats.invalid_marker);
    try std.testing.expectEqual(expected_invalid_ids[shard], stats.invalid_ids);
    try std.testing.expectEqual(expected_conflicting_colour[shard], stats.conflicting_colour);
    try std.testing.expectEqual(expected_duplicate_jfif[shard], stats.duplicate_jfif);
    try std.testing.expectEqual(stats.candidates, stats.decoded + stats.failed);
    try std.testing.expectEqual(stats.failed, stats.missing_jfif + stats.invalid_marker + stats.invalid_ids + stats.conflicting_colour + stats.duplicate_jfif);
    std.debug.print("HWPX JPEG shard {d}: {any}\n", .{ shard, stats });
    return stats;
}

test "HWPX JPEG pixel shard 0" {
    _ = try survey(0);
}
test "HWPX JPEG pixel shard 1" {
    _ = try survey(1);
}
test "HWPX JPEG pixel shard 2" {
    _ = try survey(2);
}
test "HWPX JPEG pixel shard 3" {
    _ = try survey(3);
}
test "HWPX JPEG pixel shard 4" {
    _ = try survey(4);
}
test "HWPX JPEG pixel shard 5" {
    _ = try survey(5);
}
test "HWPX JPEG pixel shard 6" {
    _ = try survey(6);
}
test "HWPX JPEG pixel shard 7" {
    _ = try survey(7);
}

test "HWPX JPEG independent grayscale pixel comparison sample" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(100_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestImagePayloads(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.targets.len);
    const encoded = try document.archive.decode(document.archive.entries[report.targets[0].entry_index], 64 * 1024 * 1024);
    defer document.archive.allocator.free(encoded);
    var image = try @import("image/jpeg/jfif_rgb.zig").decode(a, encoded, .{ .upsampling = .nearest, .colour_management = .unmanaged });
    defer image.deinit(a);
    try std.testing.expectEqual(@as(usize, 312_480), image.raster.rgb.len);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(image.raster.rgb, &digest, .{});
    var channel_sum: u64 = 0;
    for (image.raster.rgb) |channel| channel_sum += channel;
    std.debug.print("Zig JFIF grayscale SHA-256: {s}, channel sum: {d}\n", .{ std.fmt.bytesToHex(digest, .lower), channel_sum });
}

// Dedicated read-only pipe for the independent Python pixel difference tool.
// This test is not imported by the default root or audit suite.
test "HWPX JPEG raw grayscale pixel stream" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(100_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestImagePayloads(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.targets.len);
    const encoded = try document.archive.decode(document.archive.entries[report.targets[0].entry_index], 64 * 1024 * 1024);
    defer document.archive.allocator.free(encoded);
    var image = try @import("image/jpeg/jfif_rgb.zig").decode(a, encoded, .{ .upsampling = .nearest, .colour_management = .unmanaged });
    defer image.deinit(a);
    try std.testing.expectEqual(@as(usize, 312_480), image.raster.rgb.len);
    try std.Io.File.stdout().writeStreamingAll(std.testing.io, image.raster.rgb);
}

test "HWPX JPEG grayscale first mismatch IDCT evidence" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(100_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestImagePayloads(a, .{});
    defer report.deinit(a);
    const encoded = try document.archive.decode(document.archive.entries[report.targets[0].entry_index], 64 * 1024 * 1024);
    defer document.archive.allocator.free(encoded);
    var decoder = try @import("image/jpeg/sequential_frame.zig").Decoder.init(encoded, .{});
    var found = false;
    while (try decoder.next()) |packet| {
        const block = packet.coefficients;
        if (block.frame_component != 0 or block.x != 120 or block.y != 0) continue;
        found = true;
        const dequantized = @import("image/jpeg/dequantization.zig").block(block.values, packet.quantization);
        const centered = @import("image/jpeg/idct.zig").transform(dequantized)[1 * 8 + 5];
        std.debug.print("IDCT centered={d:.17} sample={d} sparse=", .{ centered, try (try @import("image/jpeg/sample_restoration.zig").Format.init(8)).sample(centered) });
        for (dequantized, 0..) |value, index| if (value != 0) std.debug.print(" {d}:{d}", .{ index, value });
        std.debug.print("\n", .{});
    }
    try std.testing.expect(found);
}

// Fixed-size records (x:u32, y:u32, 64 signed i64 raster coefficients) are
// consumed by the independent Python DCT check; no source document is changed.
test "HWPX JPEG dequantized grayscale block stream" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(100_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectManifestImagePayloads(a, .{});
    defer report.deinit(a);
    const encoded = try document.archive.decode(document.archive.entries[report.targets[0].entry_index], 64 * 1024 * 1024);
    defer document.archive.allocator.free(encoded);
    var decoder = try @import("image/jpeg/sequential_frame.zig").Decoder.init(encoded, .{});
    var count: usize = 0;
    while (try decoder.next()) |packet| {
        const block = packet.coefficients;
        try std.testing.expectEqual(@as(usize, 0), block.frame_component);
        const dequantized = @import("image/jpeg/dequantization.zig").block(block.values, packet.quantization);
        var record: [520]u8 = undefined;
        std.mem.writeInt(u32, record[0..4], block.x, .little);
        std.mem.writeInt(u32, record[4..8], block.y, .little);
        for (dequantized, 0..) |value, index| std.mem.writeInt(i64, record[8 + index * 8 ..][0..8], value, .little);
        try std.Io.File.stdout().writeStreamingAll(std.testing.io, &record);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 155 * 11), count);
}

test "HWPX JPEG observed zero-based component ID sample" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx", a, .limited(25_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const rgb = @import("image/jpeg/jfif_rgb.zig");
    var found_three = false;
    var found_gray = false;
    for (document.archive.entries) |entry| {
        if (std.mem.eql(u8, entry.name, "BinData/image353.jpg")) {
            found_three = true;
            const encoded = try document.archive.decode(entry, 1_000_000);
            defer document.archive.allocator.free(encoded);
            try std.testing.expectError(error.InvalidJfifComponentId, rgb.decode(a, encoded, .{ .upsampling = .nearest, .colour_management = .unmanaged }));
            var image = try rgb.decode(a, encoded, .{ .upsampling = .nearest, .colour_management = .unmanaged, .component_ids = .observed_zero_based_three });
            defer image.deinit(a);
            try std.testing.expect(image.observed_zero_based_component_ids);
            try std.testing.expectEqual(@as(usize, 2850 * 3900 * 3), image.raster.rgb.len);
        } else if (std.mem.eql(u8, entry.name, "BinData/image401.jpg")) {
            found_gray = true;
            const encoded = try document.archive.decode(entry, 1_000_000);
            defer document.archive.allocator.free(encoded);
            try std.testing.expectError(error.InvalidJfifComponentId, rgb.decode(a, encoded, .{ .upsampling = .nearest, .colour_management = .unmanaged, .component_ids = .observed_zero_based_three }));
        }
    }
    try std.testing.expect(found_three and found_gray);
}

test "HWPX JPEG Exif Adobe zero-based sample requires both opt-ins" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx", a, .limited(25_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    for (document.archive.entries) |entry| {
        if (!std.mem.eql(u8, entry.name, "BinData/image3.jpg")) continue;
        const encoded = try document.archive.decode(entry, 6_000_000);
        defer document.archive.allocator.free(encoded);
        const pixels = @import("image/jpeg/pixel_inspection.zig");
        const strict: pixels.Options = .{ .render = .{ .upsampling = .nearest, .colour_management = .unmanaged, .component_ids = .observed_zero_based_three }, .completion = .require_full };
        try std.testing.expectError(error.MissingJfifHeader, pixels.inspect(a, encoded, strict, 64 * 1024 * 1024));
        var selected = strict;
        selected.exif_adobe_colour = true;
        const accepted = try pixels.inspect(a, encoded, selected, 64 * 1024 * 1024);
        try std.testing.expect(accepted.exif_adobe_colour and accepted.observed_zero_based_component_ids);
        try std.testing.expectEqual(@as(usize, 3808 * 2539 * 3), accepted.rgb_bytes);
        selected.render.component_ids = .strict;
        try std.testing.expectError(error.UnsupportedExifComponentIds, pixels.inspect(a, encoded, selected, 64 * 1024 * 1024));
        return;
    }
    return error.MissingJpegFixture;
}

test "HWPX JPEG observed zero-based document stays within explicit RGB budget" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue2006/1790387_prep_final_report.hwpx", a, .limited(25_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const selected: @import("hwpx/image_payloads.zig").Options = .{
        .jpeg_pixels = .{ .render = .{ .upsampling = .nearest, .colour_management = .unmanaged, .component_ids = .observed_zero_based_three } },
        .max_total_jpeg_rgb_bytes = 2 * 1024 * 1024 * 1024,
    };
    var report = try document.inspectManifestImagePayloads(a, selected);
    defer report.deinit(a);
    var jpeg_count: usize = 0;
    var nonstandard_count: usize = 0;
    for (report.targets) |target| {
        if (target.format != .jpeg) continue;
        jpeg_count += 1;
        if (target.inspection_error) |err| return err;
        if (target.observed_zero_based_jpeg_component_ids) nonstandard_count += 1;
    }
    try std.testing.expectEqual(@as(usize, 36), jpeg_count);
    try std.testing.expectEqual(@as(usize, 31), nonstandard_count);
    try std.testing.expectEqual(@as(usize, 1_099_249_830), report.jpeg_rgb_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectManifestImagePayloads(a, .{ .jpeg_pixels = selected.jpeg_pixels, .max_total_jpeg_rgb_bytes = 256 * 1024 * 1024 }));
}

// Read-only pipe for independent colour order/upsampling comparisons.
test "HWPX JPEG raw observed zero-based RGB stream" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx", a, .limited(25_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    for (document.archive.entries) |entry| {
        if (!std.mem.eql(u8, entry.name, "BinData/image353.jpg")) continue;
        const encoded = try document.archive.decode(entry, 1_000_000);
        defer document.archive.allocator.free(encoded);
        var image = try @import("image/jpeg/jfif_rgb.zig").decode(a, encoded, .{ .upsampling = .nearest, .colour_management = .unmanaged, .component_ids = .observed_zero_based_three });
        defer image.deinit(a);
        try std.testing.expect(image.observed_zero_based_component_ids);
        try std.Io.File.stdout().writeStreamingAll(std.testing.io, image.raster.rgb);
        return;
    }
    return error.MissingJpegFixture;
}

test "HWPX JPEG Exif Adobe corpus candidate survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    const pixels = @import("image/jpeg/pixel_inspection.zig");
    const candidates = @import("hwpx/manifest_image_payloads.zig");
    const marker = @import("image/jpeg/markers.zig");
    const selected: pixels.Options = .{ .render = .{ .upsampling = .nearest, .colour_management = .unmanaged, .component_ids = .observed_zero_based_three }, .completion = .require_full, .exif_adobe_colour = true };
    var seen: usize = 0;
    var decoded: usize = 0;
    var zero_based: usize = 0;
    var missing_adobe: usize = 0;
    var unsupported_components: usize = 0;
    var rgb_bytes: usize = 0;
    var orientation_checked: usize = 0;
    var exif_orientation_present: usize = 0;
    var all_exif_orientation_one: usize = 0;
    var all_exif_orientation_missing: usize = 0;
    var product_orientation_one: usize = 0;
    var product_orientation_missing: usize = 0;
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |file| {
            if (file.kind != .file or !std.mem.endsWith(u8, file.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, file.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                if (err == error.MissingEndRecord) continue;
                return err;
            };
            defer document.deinit(a);
            var protection = try document.inspectProtection(a, .{});
            defer protection.deinit(a);
            if (protection.encrypted_paths.len != 0) continue;
            for (document.manifest.items) |item| {
                if (!candidates.isCandidate(item)) continue;
                const entry_index = item.entry_index orelse continue;
                const encoded = try document.archive.decode(document.archive.entries[entry_index], 64 * 1024 * 1024);
                defer document.archive.allocator.free(encoded);
                if (!std.mem.startsWith(u8, encoded, &.{ 255, 216 })) continue;
                var it = try marker.Iterator.init(encoded, .{});
                _ = try it.next();
                const first = (try it.next()) orelse continue;
                if (!@import("image/jpeg/exif_tiff.zig").isExifMarker(first)) continue;
                seen += 1;
                const envelope = try @import("image/jpeg/exif_tiff.zig").inspect(first.payload, .{});
                if (envelope.orientation) |value| {
                    try std.testing.expectEqual(@as(u8, 1), value);
                    all_exif_orientation_one += 1;
                } else all_exif_orientation_missing += 1;
                var one_item = [_]@import("hwpx/content_manifest.zig").Item{item};
                const one_manifest: @import("hwpx/content_manifest.zig").Manifest = .{ .items = &one_item, .spine = @constCast(&[_]@import("hwpx/content_manifest.zig").SpineRef{}), .xml_bytes = 0 };
                var product = try candidates.inspect(a, document.archive, one_manifest, .{ .jpeg_exif_orientation = .{} });
                defer product.deinit(a);
                try std.testing.expectEqual(@as(usize, 1), product.targets.len);
                try std.testing.expectEqual(@as(usize, 0), product.inspection_failures);
                try std.testing.expectEqual(@as(usize, 0), product.jpeg_exif_orientation_failures);
                try std.testing.expect(product.targets[0].jpeg_exif_orientation_inspected);
                try std.testing.expectEqual(envelope.orientation, product.targets[0].jpeg_exif_orientation);
                if (product.targets[0].jpeg_exif_orientation != null) product_orientation_one += 1 else product_orientation_missing += 1;
                const result = pixels.inspect(a, encoded, selected, 128 * 1024 * 1024) catch |err| {
                    switch (err) {
                        error.MissingAdobeColourDeclaration => missing_adobe += 1,
                        error.UnsupportedExifComponentCount => unsupported_components += 1,
                        else => return err,
                    }
                    var product_failure = try candidates.inspect(a, document.archive, one_manifest, .{ .jpeg_pixels = .{ .exif_adobe_colour = true, .render = selected.render }, .jpeg_exif_orientation = .{} });
                    defer product_failure.deinit(a);
                    try std.testing.expectEqual(err, product_failure.targets[0].inspection_error.?);
                    try std.testing.expectEqual(@as(usize, 1), product_failure.inspection_failures);
                    try std.testing.expect(product_failure.targets[0].jpeg_exif_orientation_inspected);
                    try std.testing.expectEqual(envelope.orientation, product_failure.targets[0].jpeg_exif_orientation);
                    continue;
                };
                try std.testing.expect(result.exif_adobe_colour);
                decoded += 1;
                zero_based += @intFromBool(result.observed_zero_based_component_ids);
                rgb_bytes += result.rgb_bytes;
                orientation_checked += 1;
                exif_orientation_present += @intFromBool(envelope.orientation != null);
            }
        }
    }
    try std.testing.expectEqual(@as(usize, 34), seen);
    try std.testing.expectEqual(@as(usize, 33), decoded);
    try std.testing.expectEqual(@as(usize, 1), zero_based);
    try std.testing.expectEqual(@as(usize, 1), missing_adobe);
    try std.testing.expectEqual(@as(usize, 0), unsupported_components);
    try std.testing.expectEqual(@as(usize, 171_143_412), rgb_bytes);
    try std.testing.expectEqual(@as(usize, 33), orientation_checked);
    try std.testing.expectEqual(@as(usize, 31), exif_orientation_present);
    try std.testing.expectEqual(@as(usize, 31), all_exif_orientation_one);
    try std.testing.expectEqual(@as(usize, 3), all_exif_orientation_missing);
    try std.testing.expectEqual(all_exif_orientation_one, product_orientation_one);
    try std.testing.expectEqual(all_exif_orientation_missing, product_orientation_missing);
    std.debug.print("HWPX Exif Adobe JPEG: seen={d} decoded={d} RGB={d} zero-based={d} no-Adobe={d} unsupported-components={d} orientation={d} present={d} all-one={d} all-missing={d}\n", .{ seen, decoded, rgb_bytes, zero_based, missing_adobe, unsupported_components, orientation_checked, exif_orientation_present, product_orientation_one, product_orientation_missing });
}

// Read-only RGB pipe for a small Exif-first Adobe YCbCr corpus image.
test "HWPX JPEG raw Exif Adobe RGB stream" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx", a, .limited(25_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    for (document.archive.entries) |entry| {
        if (!std.mem.eql(u8, entry.name, "BinData/image177.jpg")) continue;
        const encoded = try document.archive.decode(entry, 1_000_000);
        defer document.archive.allocator.free(encoded);
        var image = try @import("image/jpeg/exif_adobe_rgb.zig").decode(a, encoded, .{ .render = .{ .upsampling = .nearest, .colour_management = .unmanaged }, .completion = .require_full });
        defer image.deinit(a);
        try std.testing.expectEqual(@as(usize, 2011 * 133 * 3), image.raster.rgb.len);
        try std.Io.File.stdout().writeStreamingAll(std.testing.io, image.raster.rgb);
        return;
    }
    return error.MissingJpegFixture;
}

// Read-only pipe for independent Pillow CMYK/YCCK colour comparison.
test "HWPX JPEG raw Exif Adobe YCCK RGB stream" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue6269/156739836_public_sector_jobs_stats.hwpx", a, .limited(25_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    for (document.archive.entries) |entry| {
        if (!std.mem.eql(u8, entry.name, "BinData/image1.jpg")) continue;
        const encoded = try document.archive.decode(entry, 2_000_000);
        defer document.archive.allocator.free(encoded);
        var image = try @import("image/jpeg/exif_adobe_rgb.zig").decode(a, encoded, .{ .render = .{ .upsampling = .nearest, .colour_management = .unmanaged }, .completion = .require_full });
        defer image.deinit(a);
        try std.testing.expectEqual(@as(usize, 1211 * 355 * 3), image.raster.rgb.len);
        try std.Io.File.stdout().writeStreamingAll(std.testing.io, image.raster.rgb);
        return;
    }
    return error.MissingJpegFixture;
}
