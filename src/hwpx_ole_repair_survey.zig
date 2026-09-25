const std = @import("std");
const package = @import("hwpx/package.zig");
const envelope = @import("ole/envelope.zig");
const cfb = @import("cfb/reader.zig");
const repairs = @import("cfb/observed_repairs.zig");
const expected = @import("hwpx_corpus_expectations.zig");

const Stats = struct {
    documents: usize = 0,
    candidates: usize = 0,
    strict: usize = 0,
    repaired: usize = 0,
    root_created: usize = 0,
    fat_tail: usize = 0,
    mini_tail: usize = 0,
    streams: usize = 0,
    stream_bytes: usize = 0,
    stream_hash_u64: u64 = 0,

    fn addStreams(self: *Stats, file: cfb.File) void {
        for (file.entries) |entry| {
            if (entry.kind != 2) continue;
            var digest: [32]u8 = undefined;
            std.crypto.hash.sha2.Sha256.hash(entry.content, &digest, .{});
            self.streams += 1;
            self.stream_bytes += entry.content.len;
            self.stream_hash_u64 +%= std.mem.readInt(u64, digest[0..8], .little);
        }
    }
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
            var report = try document.inspectOlePayloads(a, .{});
            defer report.deinit(a);
            stats.candidates += report.candidates;
            for (report.targets) |target| {
                const encoded = try document.archive.decode(document.archive.entries[target.entry_index], 64 * 1024 * 1024);
                defer document.archive.allocator.free(encoded);
                const inner = try envelope.payload(encoded, target.layout orelse return error.UnexpectedOleLayout, 64 * 1024 * 1024);
                if (target.inspection_error) |strict_error| {
                    if (strict_error != error.InvalidRoot and strict_error != error.InvalidFat) return strict_error;
                    const from_product = target.normalized orelse return error.MissingObservedNormalization;
                    var normalized = try repairs.open(a, inner, .{ .max_input_bytes = 64 * 1024 * 1024 });
                    defer normalized.deinit();
                    try std.testing.expectEqualDeep(from_product.deviations, normalized.deviations);
                    try std.testing.expectEqual(from_product.counts.entries, normalized.file.entries.len);
                    stats.repaired += 1;
                    stats.root_created += @intFromBool(normalized.deviations.original_root_created != 0);
                    stats.fat_tail += @intFromBool(normalized.deviations.zero_fat_tail_slots != 0);
                    stats.mini_tail += @intFromBool(normalized.deviations.zero_mini_tail_slots != 0);
                    stats.addStreams(normalized.file);
                } else {
                    try std.testing.expectEqual(@as(?@import("hwpx/ole_payloads.zig").Normalized, null), target.normalized);
                    var file = try cfb.File.open(a, inner, .{ .strict = true, .max_input_bytes = 64 * 1024 * 1024 });
                    defer file.deinit();
                    stats.strict += 1;
                    stats.addStreams(file);
                }
            }
        }
    }
    try std.testing.expectEqual(expected.ole_candidates[shard], stats.candidates);
    try std.testing.expectEqual(expected.ole_invalid_root[shard], stats.repaired);
    try std.testing.expectEqual(expected.ole_invalid_root[shard], stats.root_created);
    try std.testing.expectEqual(expected.ole_fat_tail_nonfree[shard], stats.fat_tail);
    try std.testing.expectEqual(expected.ole_mini_tail_nonfree[shard], stats.mini_tail);
    try std.testing.expectEqual(expected.ole_compat_streams[shard], stats.streams);
    try std.testing.expectEqual(expected.ole_compat_stream_bytes[shard], stats.stream_bytes);
    try std.testing.expectEqual(expected.ole_compat_stream_hash_u64[shard], stats.stream_hash_u64);
    return stats;
}

test "HWPX OLE normalized shard 0" {
    const s = try survey(0);
    std.debug.print("OLE normalized shard 0: {any}\n", .{s});
}
test "HWPX OLE normalized shard 1" {
    const s = try survey(1);
    std.debug.print("OLE normalized shard 1: {any}\n", .{s});
}
test "HWPX OLE normalized shard 2" {
    const s = try survey(2);
    std.debug.print("OLE normalized shard 2: {any}\n", .{s});
}
test "HWPX OLE normalized shard 3" {
    const s = try survey(3);
    std.debug.print("OLE normalized shard 3: {any}\n", .{s});
}
test "HWPX OLE normalized shard 4" {
    const s = try survey(4);
    std.debug.print("OLE normalized shard 4: {any}\n", .{s});
}
test "HWPX OLE normalized shard 5" {
    const s = try survey(5);
    std.debug.print("OLE normalized shard 5: {any}\n", .{s});
}
test "HWPX OLE normalized shard 6" {
    const s = try survey(6);
    std.debug.print("OLE normalized shard 6: {any}\n", .{s});
}
test "HWPX OLE normalized shard 7" {
    const s = try survey(7);
    std.debug.print("OLE normalized shard 7: {any}\n", .{s});
}
