//! Optional real-file differential; not part of the self-contained root tests.
const std = @import("std");
const header = @import("cfb/header.zig");
const cfb = @import("cfb/reader.zig");
const repairs = @import("cfb/observed_repairs.zig");

test "CFB observed repairs seven real files preserve every live stream" {
    const a = std.testing.allocator;
    const paths = [_][]const u8{
        "reference/hwp2md/testdata/hangul5test.hwp",
        "reference/rhwp/rhwp-studio/public/samples/tac-case-001.hwp",
        "reference/rhwp/samples/tac-case-001.hwp",
        "reference/rhwp/samples/mix-shape-01.hwp",
        "reference/rhwp/samples/hwpspec.hwp",
        "reference/rhwp/samples/img-start-001.hwp",
        "reference/rhwp/samples/hwp-3.0-HWPML.hwp",
    };
    var streams: usize = 0;
    for (paths, 0..) |path, path_index| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64 * 1024 * 1024));
        defer a.free(bytes);
        const original = try a.dupe(u8, bytes);
        defer a.free(original);
        var repaired = try repairs.open(a, bytes, .{ .max_input_bytes = 64 * 1024 * 1024 });
        defer repaired.deinit();
        try std.testing.expectEqualSlices(u8, original, bytes);
        if (path_index == 0) {
            try std.testing.expectEqual(@as(usize, 1), repaired.deviations.off_by_one_fat_markers);
            try std.testing.expectEqual(@as(usize, 1), repaired.deviations.orphan_end_fat_slots);
        }
        const baseline = try a.dupe(u8, bytes);
        defer a.free(baseline);
        if (path_index == 0) {
            // Independent DIFAT location evidence makes permissive extraction
            // possible for this otherwise unreadable original file.
            const head = try header.Header.parse(baseline);
            const sector_count = baseline.len / head.sector_size - 1;
            const id = try header.int(u32, baseline, 76 + 4 * (head.fat_count - 1));
            try std.testing.expectEqual(sector_count - 1, id);
            const offset = (@as(usize, id) + 1) * head.sector_size + @as(usize, id) % (head.sector_size / 4) * 4;
            try std.testing.expectEqual(sector_count, try header.int(u32, baseline, offset));
            std.mem.writeInt(u32, baseline[offset..][0..4], header.fat_sector, .little);
        }
        var permissive = try cfb.File.open(a, baseline, .{ .max_input_bytes = 64 * 1024 * 1024 });
        defer permissive.deinit();
        try std.testing.expectEqual(permissive.entries.len, repaired.file.entries.len);
        for (permissive.entries, repaired.file.entries) |expected, actual| {
            try std.testing.expectEqual(expected.kind, actual.kind);
            if (expected.kind != 2) continue;
            try std.testing.expectEqualStrings(expected.path, actual.path);
            try std.testing.expectEqualSlices(u8, expected.content, actual.content);
            streams += 1;
        }
    }
    try std.testing.expect(streams > 0);
    std.debug.print("CFB observed repair corpus: files={d} streams={d} exact\n", .{ paths.len, streams });
}
