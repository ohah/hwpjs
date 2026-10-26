const std = @import("std");
const audit = @import("hwp5/edit/docinfo_version_transition.zig");

test "DocInfo version transition inventories actual old source without assuming header-only conversion" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
    const raw = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(raw);
    const before = try a.dupe(u8, raw);
    defer a.free(before);
    var report = try audit.read(a, raw, source.header.version(), .{ .raw = 0x05000300 });
    defer report.deinit(a);
    try std.testing.expectEqual(.selected_docinfo_payloads, report.scope);
    try std.testing.expect(!report.conversion_authorized);
    var characters: usize = 0;
    var paragraphs: usize = 0;
    var mappings: usize = 0;
    for (report.rows) |row| {
        try std.testing.expect(row.ordinal < report.records);
        try std.testing.expect(row.offset < raw.len);
        try std.testing.expect(row.target_error == null);
        if (row.kind == .character) {
            try std.testing.expectEqual(@as(usize, 68), row.bytes);
            try std.testing.expectEqual(@as(?usize, 6), row.absent_profile_bytes);
            characters += 1;
        } else if (row.kind == .paragraph) {
            try std.testing.expectEqual(@as(?usize, 8), row.absent_profile_bytes);
            paragraphs += 1;
        } else if (row.kind == .mappings) {
            try std.testing.expectEqual(@as(?usize, 15), row.source_expected_fields);
            try std.testing.expectEqual(@as(?usize, 16), row.target_expected_fields);
            try std.testing.expectEqual(@as(?usize, 16), row.existing_fields);
            try std.testing.expectEqual(@as(?i32, 0), row.existing_memo_count);
            try std.testing.expectEqual(@as(?usize, 0), row.absent_profile_bytes);
            mappings += 1;
            std.debug.print("transition mappings: actual={d} source-profile={d} target-profile={d} absent-bytes={d}\n", .{ row.existing_fields.?, row.source_expected_fields.?, row.target_expected_fields.?, row.absent_profile_bytes.? });
        } else if (row.kind == .numbering) {
            try std.testing.expectEqual(@as(usize, 144), row.source_known_bytes);
            try std.testing.expectEqual(@as(?usize, 144), row.target_known_bytes);
            try std.testing.expectEqual(@as(?usize, 0), row.reinterpreted_bytes);
            try std.testing.expectEqual(@as(?usize, 28), row.absent_profile_bytes);
            std.debug.print("transition numbering: source-known={d} target-known={d} reinterpreted={d} absent-bytes={d}\n", .{ row.source_known_bytes, row.target_known_bytes.?, row.reinterpreted_bytes.?, row.absent_profile_bytes.? });
        }
    }
    try std.testing.expectEqual(@as(usize, 19), characters);
    try std.testing.expectEqual(@as(usize, 12), paragraphs);
    try std.testing.expectEqual(@as(usize, 1), mappings);
    try std.testing.expectEqual(report.records, report.rows.len + report.unexamined_records);
    try std.testing.expect(report.unexamined_records > 0);
    try std.testing.expectEqual(@as(usize, 69), report.records);
    try std.testing.expectEqual(@as(usize, 36), report.unexamined_records);
    try std.testing.expectEqualSlices(u8, before, raw);
    std.debug.print("transition inventory: characters={d} paragraphs={d} selected={d} unexamined={d}\n", .{ characters, paragraphs, report.rows.len, report.unexamined_records });
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("hwp5/version.zig").Version, expected: []const audit.Row) !void {
            var value = try audit.read(allocator, bytes, version, .{ .raw = 0x05000300 });
            defer value.deinit(allocator);
            try std.testing.expectEqualDeep(expected, value.rows);
        }
    }.run, .{ raw, source.header.version(), report.rows });
}

test "DocInfo version transition distinguishes existing fields opaque reinterpretation and partial target tails" {
    const a = std.testing.allocator;
    var report = blk: {
        var bytes: std.ArrayList(u8) = .empty;
        defer bytes.deinit(a);
        const append = @import("hwp5/record_writer.zig").append;
        const mappings: [64]u8 = @splat(0);
        try append(a, &bytes, 17, 0, mappings[0..60], 4096);
        try append(a, &bytes, 17, 0, &mappings, 4096);
        const character: [74]u8 = @splat(0);
        try append(a, &bytes, 21, 1, &character, 4096);
        try append(a, &bytes, 21, 1, character[0..69], 4096);
        const paragraph: [54]u8 = @splat(0);
        try append(a, &bytes, 25, 1, &paragraph, 4096);
        const numbering: [128]u8 = @splat(0); // Seven (12-byte head + empty UTF16 length), start, then 7 UINT32.
        try append(a, &bytes, 23, 1, &numbering, 4096);
        try append(a, &bytes, 999, 1, &.{ 1, 2, 3 }, 4096);
        break :blk try audit.read(a, bytes.items, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 });
    };
    defer report.deinit(a);
    try std.testing.expect(!report.conversion_authorized);
    try std.testing.expectEqual(@as(usize, 7), report.records);
    try std.testing.expectEqual(@as(usize, 1), report.unexamined_records);
    try std.testing.expectEqual(@as(usize, 6), report.rows.len);
    try std.testing.expectEqual(@as(?usize, 4), report.rows[0].absent_profile_bytes);
    try std.testing.expectEqual(@as(?usize, 0), report.rows[1].absent_profile_bytes);
    try std.testing.expect(report.rows[0].existing_memo_count == null);
    try std.testing.expectEqual(@as(?i32, 0), report.rows[1].existing_memo_count);
    try std.testing.expectEqual(@as(?usize, 6), report.rows[2].reinterpreted_bytes);
    try std.testing.expectEqual(@as(usize, 68), report.rows[2].source_known_bytes);
    try std.testing.expectEqual(@as(?usize, 74), report.rows[2].target_known_bytes);
    try std.testing.expectEqualStrings("UnexpectedEnd", report.rows[3].target_error.?);
    try std.testing.expect(report.rows[3].target_known_bytes == null and report.rows[3].absent_profile_bytes == null);
    try std.testing.expectEqual(@as(?usize, 8), report.rows[4].reinterpreted_bytes);
    try std.testing.expectEqual(@as(?usize, 28), report.rows[5].reinterpreted_bytes);
    try std.testing.expectEqual(@as(?usize, 0), report.rows[5].absent_profile_bytes);
    try std.testing.expectError(error.UnsupportedDocInfoTransitionTarget, audit.read(a, &.{}, .{ .raw = 0x05010100 }, .{ .raw = 0x05000300 }));
    try std.testing.expectError(error.UnsupportedDocInfoTransitionTarget, audit.read(a, &.{}, .{ .raw = 0x05000107 }, .{ .raw = 0x05000302 }));
    try std.testing.expectError(error.UnexpectedEnd, audit.read(a, &.{ 1, 2, 3 }, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }));
    const malformed_source = [_]u8{ 21, 4, 0x10, 0, 0 }; // CHAR_SHAPE with one payload byte.
    try std.testing.expectError(error.UnexpectedEnd, audit.read(a, &malformed_source, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }));
}
