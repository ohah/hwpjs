const std = @import("std");
const package = @import("hwpx/package.zig");
const bmp = @import("image/bmp/pixels.zig");
const expected = @import("hwpx_corpus_expectations.zig");

const Stats = struct {
    documents: usize = 0,
    candidates: usize = 0,
    decoded: usize = 0,
    failures: usize = 0,
    file_size_failures: usize = 0,
    image_size_failures: usize = 0,
    rgba_bytes: usize = 0,
    rgba_hash_u64: u64 = 0,
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
            var report = try document.inspectManifestImagePayloads(a, .{});
            defer report.deinit(a);
            var document_rgba_bytes: usize = 0;
            for (report.targets) |target| {
                if (target.format != .bmp) continue;
                stats.candidates += 1;
                try std.testing.expectEqual(@import("hwpx/image_payloads.zig").Inspection.bmp_rgba, target.inspection);
                const encoded = try document.archive.decode(document.archive.entries[target.entry_index], 64 * 1024 * 1024);
                defer document.archive.allocator.free(encoded);
                var image = bmp.decode(a, encoded, .{ .colour_management = .unmanaged, .mask_scaling = .nearest_normalized }) catch |err| {
                    try std.testing.expectEqual(@as(?anyerror, err), target.inspection_error);
                    stats.failures += 1;
                    switch (err) {
                        error.TrailingBmpBytes, error.UnexpectedEnd => stats.file_size_failures += 1,
                        error.InvalidBmpImageSize => stats.image_size_failures += 1,
                        else => return err,
                    }
                    continue;
                };
                defer image.deinit(a);
                try std.testing.expectEqual(@as(?anyerror, null), target.inspection_error);
                stats.decoded += 1;
                stats.rgba_bytes += image.rgba.len;
                document_rgba_bytes += image.rgba.len;
                var digest: [32]u8 = undefined;
                std.crypto.hash.sha2.Sha256.hash(image.rgba, &digest, .{});
                stats.rgba_hash_u64 +%= std.mem.readInt(u64, digest[0..8], .little);
            }
            try std.testing.expectEqual(document_rgba_bytes, report.bmp_rgba_bytes);
        }
    }
    try std.testing.expectEqual(expected.bmp_pixel_candidates[shard], stats.candidates);
    try std.testing.expectEqual(expected.bmp_pixel_decoded[shard], stats.decoded);
    try std.testing.expectEqual(expected.bmp_pixel_candidates[shard] - expected.bmp_pixel_decoded[shard], stats.failures);
    try std.testing.expectEqual(expected.bmp_pixel_file_size_rejected[shard], stats.file_size_failures);
    try std.testing.expectEqual(expected.bmp_pixel_image_size_rejected[shard], stats.image_size_failures);
    try std.testing.expectEqual(expected.bmp_pixel_bytes[shard], stats.rgba_bytes);
    try std.testing.expectEqual(expected.bmp_pixel_hash_u64[shard], stats.rgba_hash_u64);
    return stats;
}

test "HWPX BMP pixel shard 0" {
    const s = try survey(0);
    std.debug.print("BMP pixel shard 0: {any}\n", .{s});
}
test "HWPX BMP pixel shard 1" {
    const s = try survey(1);
    std.debug.print("BMP pixel shard 1: {any}\n", .{s});
}
test "HWPX BMP pixel shard 2" {
    const s = try survey(2);
    std.debug.print("BMP pixel shard 2: {any}\n", .{s});
}
test "HWPX BMP pixel shard 3" {
    const s = try survey(3);
    std.debug.print("BMP pixel shard 3: {any}\n", .{s});
}
test "HWPX BMP pixel shard 4" {
    const s = try survey(4);
    std.debug.print("BMP pixel shard 4: {any}\n", .{s});
}
test "HWPX BMP pixel shard 5" {
    const s = try survey(5);
    std.debug.print("BMP pixel shard 5: {any}\n", .{s});
}
test "HWPX BMP pixel shard 6" {
    const s = try survey(6);
    std.debug.print("BMP pixel shard 6: {any}\n", .{s});
}
test "HWPX BMP pixel shard 7" {
    const s = try survey(7);
    std.debug.print("BMP pixel shard 7: {any}\n", .{s});
}
