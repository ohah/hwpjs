const std = @import("std");
const zip = @import("zip/archive.zig");
const manifest = @import("hwpx/content_manifest.zig");
const ole = @import("hwpx/ole_payloads.zig");
const package = @import("hwpx/package.zig");

fn packagedIndex(archive: zip.Archive, item: manifest.Item) ?usize {
    if (item.entry_index) |index| return index;
    if (item.embedded != false or item.href.len <= 8 or !std.ascii.eqlIgnoreCase(item.href[0..8], "BinData/") or !zip.validPath(item.href)) return null;
    for (archive.entries, 0..) |entry, index| {
        if (std.mem.eql(u8, entry.name, item.href)) return index;
    }
    return null;
}

pub const Stats = struct {
    candidates: usize = 0,
    external: usize = 0,
    copies: usize = 0,
    external_copies: usize = 0,
    missing: usize = 0,
    prefixed: usize = 0,
    raw: usize = 0,
    unknown: usize = 0,
    failures: usize = 0,
    failed_external: usize = 0,
    invalid_root: usize = 0,
    invalid_fat: usize = 0,
    encoded_bytes: usize = 0,
    streams: usize = 0,
    stream_bytes: usize = 0,
    normalized_targets: usize = 0,
    normalized_streams: usize = 0,
    normalized_stream_bytes: usize = 0,
    normalized_root_created: usize = 0,
    normalized_fat_tail: usize = 0,
    normalized_mini_tail: usize = 0,
    normalization_errors: usize = 0,

    pub fn from(archive: zip.Archive, items: manifest.Manifest, known: *const package.KnownReport) !Stats {
        const report = &known.ole_payloads;
        var result: Stats = .{};
        var cursor: usize = 0;
        for (items.items, 0..) |item, index| {
            if (!ole.isCandidate(item)) continue;
            result.candidates += 1;
            const external = item.embedded == false;
            result.external += @intFromBool(external);
            const expected_index = packagedIndex(archive, item) orelse {
                result.missing += 1;
                continue;
            };
            try std.testing.expect(cursor < report.targets.len);
            const target = report.targets[cursor];
            cursor += 1;
            try std.testing.expectEqual(index, target.item_index);
            try std.testing.expectEqual(expected_index, target.entry_index);
            try std.testing.expectEqual(external, target.declared_external);
            result.copies += 1;
            result.external_copies += @intFromBool(external);
            result.encoded_bytes += target.encoded_bytes;
            result.streams += target.streams;
            result.stream_bytes += target.stream_bytes;
            result.failures += @intFromBool(target.inspection_error != null);
            result.failed_external += @intFromBool(external and target.inspection_error != null);
            if (target.inspection_error) |err| {
                result.invalid_root += @intFromBool(err == error.InvalidRoot);
                result.invalid_fat += @intFromBool(err == error.InvalidFat);
            }
            if (target.normalized) |normalized| {
                result.normalized_targets += 1;
                result.normalized_streams += normalized.counts.streams;
                result.normalized_stream_bytes += normalized.counts.stream_bytes;
                result.normalized_root_created += @intFromBool(normalized.deviations.original_root_created != 0);
                result.normalized_fat_tail += @intFromBool(normalized.deviations.zero_fat_tail_slots != 0);
                result.normalized_mini_tail += @intFromBool(normalized.deviations.zero_mini_tail_slots != 0);
            }
            result.normalization_errors += @intFromBool(target.normalization_error != null);
            switch (target.layout orelse {
                result.unknown += 1;
                continue;
            }) {
                .observed_size_prefix => result.prefixed += 1,
                .raw_cfb => result.raw += 1,
            }
        }
        try std.testing.expectEqual(cursor, report.targets.len);
        try std.testing.expectEqual(result.candidates, report.candidates);
        try std.testing.expectEqual(result.external, report.declared_external);
        try std.testing.expectEqual(result.copies, report.packaged_copies);
        try std.testing.expectEqual(result.external_copies, report.external_packaged_copies);
        try std.testing.expectEqual(result.missing, report.without_packaged_copy);
        try std.testing.expectEqual(result.encoded_bytes, report.encoded_bytes);
        try std.testing.expectEqual(result.failures, report.inspection_failures);
        try std.testing.expectEqual(result.streams, report.streams);
        try std.testing.expectEqual(result.stream_bytes, report.stream_bytes);
        try std.testing.expectEqual(result.normalized_targets, report.normalized_targets);
        try std.testing.expectEqual(result.normalized_streams, report.normalized_streams);
        try std.testing.expectEqual(result.normalized_stream_bytes, report.normalized_stream_bytes);
        return result;
    }

    pub fn merge(self: *Stats, other: Stats) void {
        inline for (.{ "candidates", "external", "copies", "external_copies", "missing", "prefixed", "raw", "unknown", "failures", "failed_external", "invalid_root", "invalid_fat", "encoded_bytes", "streams", "stream_bytes", "normalized_targets", "normalized_streams", "normalized_stream_bytes", "normalized_root_created", "normalized_fat_tail", "normalized_mini_tail", "normalization_errors" }) |field| {
            @field(self, field) += @field(other, field);
        }
    }
};
