const std = @import("std");

test "new font CFB saves reopens every ordinary fixture in seven languages" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var files: usize = 0;
    var edits: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwp")) continue;
        if (std.mem.eql(u8, entry.basename, "password-12345.hwp") or std.mem.eql(u8, entry.basename, "distribution.hwp") or std.mem.eql(u8, entry.basename, "viewtext.hwp")) continue;
        const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(16_000_000));
        defer a.free(bytes);
        const session = try @import("style_preservation.zig").Session.open(a, bytes);
        defer session.close();
        for (0..7) |language| {
            const checkpoint = try session.createCheckpoint(64_000_000);
            defer checkpoint.deinit();
            const id = try session.ensureFont(@enumFromInt(language), "Hwpjs Corpus Font");
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            const reopened = try @import("style_preservation.zig").Session.open(a, saved.bytes);
            defer reopened.close();
            try std.testing.expectEqual(id, try reopened.ensureFont(@enumFromInt(language), "Hwpjs Corpus Font"));
            const unchanged = try reopened.save(a, .{ .allow_stale_layout = true });
            defer a.free(unchanged.bytes);
            try std.testing.expectEqualSlices(u8, saved.bytes, unchanged.bytes);
            try session.restoreCheckpoint(checkpoint);
            const original = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(original.bytes);
            try std.testing.expectEqualSlices(u8, bytes, original.bytes);
            edits += 1;
        }
        files += 1;
    }
    try std.testing.expect(files > 0);
    std.debug.print("HWP5 new font saved fixtures: {d} files, {d} language saves\n", .{ files, edits });
}

test "new font DocInfo preserves every ordinary fixture original record in seven languages" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var files: usize = 0;
    var edits: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwp")) continue;
        if (std.mem.eql(u8, entry.basename, "password-12345.hwp") or std.mem.eql(u8, entry.basename, "distribution.hwp") or std.mem.eql(u8, entry.basename, "viewtext.hwp")) continue;
        const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(16_000_000));
        defer a.free(bytes);
        var source = try @import("../text_source.zig").Source.open(a, bytes);
        defer source.deinit();
        const input = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), 16_000_000);
        defer a.free(input);
        for (0..7) |language| {
            const output = try @import("font_face_docinfo.zig").write(a, input, source.header.version(), @enumFromInt(language), "New", 3, 16_000_000);
            defer a.free(output.bytes);
            const report = try @import("../docinfo/resources.zig").inspect(output.bytes, source.header.version(), .{});
            try report.validate();
            try std.testing.expectEqual(@as(i32, @intCast(output.id + 1)), report.fontCount(@enumFromInt(language)));
            var originals = @import("../record.zig").Iterator.init(input, .{});
            var result = @import("../record.zig").Iterator.init(output.bytes, .{});
            var boundary: usize = 0;
            var font_index: usize = 0;
            var inserted = false;
            while (try result.next()) |record| {
                if (record.tag == 19) {
                    defer font_index += 1;
                    if (font_index == boundary) {
                        try std.testing.expectEqualSlices(u8, &.{ 0, 3, 0, 'N', 0, 'e', 0, 'w', 0 }, record.payload);
                        inserted = true;
                        continue;
                    }
                }
                const original = (try originals.next()) orelse return error.UnexpectedAddedRecord;
                if (record.tag == 17) {
                    const slot = (1 + language) * 4;
                    const count = std.mem.readInt(i32, original.payload[slot..][0..4], .little);
                    try std.testing.expectEqual(@as(u32, @intCast(count)), output.id);
                    for (0..language + 1) |index| boundary += @intCast(std.mem.readInt(i32, original.payload[(1 + index) * 4 ..][0..4], .little));
                    const expected = try a.dupe(u8, original.raw);
                    defer a.free(expected);
                    const offset = original.raw.len - original.payload.len + slot;
                    std.mem.writeInt(i32, expected[offset..][0..4], count + 1, .little);
                    try std.testing.expectEqualSlices(u8, expected, record.raw);
                } else try std.testing.expectEqualSlices(u8, original.raw, record.raw);
            }
            try std.testing.expect(inserted);
            try std.testing.expect((try originals.next()) == null);
            edits += 1;
        }
        files += 1;
    }
    try std.testing.expect(files > 0);
    std.debug.print("HWP5 new font DocInfo fixtures: {d} files, {d} language insertions\n", .{ files, edits });
}
