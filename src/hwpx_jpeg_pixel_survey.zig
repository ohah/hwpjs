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
