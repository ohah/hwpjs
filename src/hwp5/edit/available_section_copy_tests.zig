const std = @import("std");
const copy = @import("available_section_copy.zig");
const Source = @import("../text_source.zig").Source;
const fixtures = @import("../test_section_count_fixture.zig");

test "available section copy handles both count directions compression and extended property headers" {
    const a = std.testing.allocator;
    const fixture = @import("../document/test_fixture.zig");
    const deflate = @import("../../compression/raw_deflate.zig");
    for ([_]u16{ 1, 3 }) |declared| for ([_]bool{ false, true }) |compressed| for ([_]bool{ false, true }) |extended| {
        var header = fixture.header();
        fixture.put(&header, 36, u32, if (compressed) 1 else 0);
        const regular = try fixture.docInfo(a, declared);
        defer a.free(regular);
        const info = try a.alloc(u8, regular.len + @as(usize, if (extended) 4 else 0));
        defer a.free(info);
        if (extended) {
            fixture.put(info, 0, u32, 16 | (0xfff << 20));
            fixture.put(info, 4, u32, 27);
            @memcpy(info[8..], regular[4..]);
        } else @memcpy(info, regular);
        const section = try fixture.section(a);
        defer a.free(section);
        const encoded_info = if (compressed) try deflate.encodeStored(a, info, 100000) else info;
        defer if (compressed) a.free(encoded_info);
        const encoded_section = if (compressed) try deflate.encodeStored(a, section, 100000) else section;
        defer if (compressed) a.free(encoded_section);
        const input = try fixtures.build(a, &header, encoded_info, encoded_section, &.{ "Section0", "Section1" });
        defer a.free(input);
        const prepared = try copy.prepare(a, input);
        defer a.free(prepared.bytes);
        try std.testing.expectEqual(declared, prepared.report.declared);
        try std.testing.expectEqual(@as(u16, 2), prepared.report.available);
        var verified = try Source.open(a, prepared.bytes);
        defer verified.deinit();
        try std.testing.expectEqual(compressed, verified.header.has(.compressed));
        const decoded = try verified.decodeDocInfo(a, 100000);
        defer a.free(decoded);
        const offset: usize = if (extended) 8 else 4;
        std.mem.writeInt(u16, info[offset..][0..2], 2, .little);
        try std.testing.expectEqualSlices(u8, info, decoded);
        try std.testing.expectEqual(@as(u16, 2), verified.section_count);
        try std.testing.expectError(error.SectionCountMismatch, Source.open(a, input));
    };
}

test "available section copy changes only count and retains every other stream and normalized baseline" {
    const a = std.testing.allocator;
    const input = try fixtures.make(a, 2, &.{"Section0"});
    defer a.free(input);
    const original = try a.dupe(u8, input);
    defer a.free(original);
    var before = try Source.openAvailableReadOnly(a, input);
    defer before.deinit();
    const prepared = try copy.prepare(a, input);
    defer a.free(prepared.bytes);
    try std.testing.expectEqual(@as(u16, 2), prepared.report.declared);
    try std.testing.expectEqual(@as(u16, 1), prepared.report.available);
    var after = try Source.open(a, prepared.bytes);
    defer after.deinit();
    const old_nodes = try before.file.toNodes(a);
    defer a.free(old_nodes);
    const new_nodes = try after.file.toNodes(a);
    defer a.free(new_nodes);
    try std.testing.expectEqual(old_nodes.len, new_nodes.len);
    const docinfo = (try before.file.findExact("/DocInfo")).?;
    for (before.file.entries, 0..) |entry, index| {
        if (entry.kind != 2 or index == docinfo) continue;
        const other = for (after.file.entries, 0..) |candidate, other_index| {
            if (candidate.kind == 2 and std.mem.eql(u8, entry.path, candidate.path)) break other_index;
        } else return error.MissingPreservedStream;
        try std.testing.expectEqualSlices(u8, old_nodes[try before.file.nodeIndex(index)].content, new_nodes[try after.file.nodeIndex(other)].content);
    }
    const expected = try before.decodeDocInfo(a, 100000);
    defer a.free(expected);
    const site = try @import("../docinfo/section_count.zig").locate(expected, before.header.version());
    std.mem.writeInt(u16, expected[site.payload_offset..][0..2], 1, .little);
    const actual = try after.decodeDocInfo(a, 100000);
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(backing: std.mem.Allocator, bytes: []const u8, baseline: []const u8) !void {
            const opened = try copy.open(backing, bytes);
            defer opened.session.close();
            try std.testing.expectEqual(@as(u16, 2), opened.report.declared);
            const saved = try opened.session.save(backing, .{});
            defer backing.free(saved.bytes);
            try std.testing.expectEqualSlices(u8, baseline, saved.bytes);
        }
    }.run, .{ input, prepared.bytes });
    try std.testing.expectEqualSlices(u8, original, input);
    try std.testing.expectError(error.SectionCountMismatch, Source.open(a, input));
}

test "available section copy rejects matching counts holes invalid declarations and distribution" {
    const a = std.testing.allocator;
    for ([_]u16{ 0, 1, 1025 }) |declared| {
        const input = try fixtures.make(a, declared, &.{"Section0"});
        defer a.free(input);
        try std.testing.expectError(if (declared == 1) error.SectionCountAlreadyMatches else error.InvalidSectionCount, copy.prepare(a, input));
    }
    const hole = try fixtures.make(a, 3, &.{ "Section0", "Section2" });
    defer a.free(hole);
    try std.testing.expectError(error.SectionCountMismatch, copy.prepare(a, hole));
    const distribution = try @import("../container/distribution_test_fixture.zig").make(a, false, false);
    defer a.free(distribution);
    try std.testing.expectError(error.UnsupportedAvailableSectionDistribution, copy.prepare(a, distribution));
    const fixture = @import("../document/test_fixture.zig");
    const header = fixture.header();
    const info = try fixture.docInfo(a, 2);
    defer a.free(info);
    const malformed = try fixtures.build(a, &header, info, &.{0}, &.{"Section0"});
    defer a.free(malformed);
    try std.testing.expectError(error.UnexpectedEnd, copy.open(a, malformed));
}

test "available section copy actual fixtures retain counts input and normalized undo redo baseline" {
    try @import("../../testing/checked_allocator.zig").run(verifyActualCopies, .{});
}

fn verifyActualCopies(a: std.mem.Allocator) !void {
    const Row = struct { path: []const u8, version: []const u8, declared: u16, available: u16, sha256: []const u8, paragraphs: usize };
    const inventory = try std.json.parseFromSlice([]const Row, a, @embedFile("../testdata/section-count-fixtures.json"), .{});
    defer inventory.deinit();
    try std.testing.expectEqual(@as(usize, 3), inventory.value.len);
    for (inventory.value, 0..) |row, index| for (inventory.value[0..index]) |previous| {
        try std.testing.expect(!std.mem.eql(u8, row.path, previous.path));
    };
    for (inventory.value) |row| {
        const path = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{row.path});
        defer a.free(path);
        const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64 * 1024 * 1024)) catch |err| switch (err) {
            error.FileNotFound => return error.SkipZigTest,
            else => return err,
        };
        defer a.free(input);
        var digest: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(input, &digest, .{});
        var expected_digest: [32]u8 = undefined;
        _ = try std.fmt.hexToBytes(&expected_digest, row.sha256);
        try std.testing.expectEqualSlices(u8, &expected_digest, &digest);
        const baseline = try copy.prepare(a, input);
        defer a.free(baseline.bytes);
        const opened = try copy.open(a, input);
        defer opened.session.close();
        try std.testing.expectEqual(row.declared, opened.report.declared);
        try std.testing.expectEqual(row.available, opened.report.available);
        try std.testing.expectEqual(@as(usize, row.available), opened.session.sectionCount());
        var paragraphs: usize = 0;
        var history = try @import("editor_history.zig").History.init(a, opened.session, 4, 16 * 1024 * 1024);
        defer history.deinit();
        for (0..opened.session.sectionCount()) |section| {
            const count = try opened.session.paragraphCount(section);
            paragraphs += count;
            const target: struct { paragraph: usize, unit: u32 } = target: {
                for (0..count) |paragraph| {
                    if ((try opened.session.paragraph(section, paragraph)).parent_node != null) continue;
                    const raw = try opened.session.copyText(a, section, paragraph);
                    defer a.free(raw);
                    // Use the core tokenizer so retained control payloads cannot
                    // become text targets; insert after any leading controls.
                    var tokens = (try @import("../body/text.zig").Text.parse(raw)).tokens();
                    while (try tokens.next()) |token| if (token.value == .text and token.raw.len != 0) {
                        break :target .{ .paragraph = paragraph, .unit = @intCast(token.start_unit) };
                    };
                }
                return error.MissingRootCopyTextTarget;
            };
            try std.testing.expect(try history.apply(opened.session, .{ .splice_text = .{ .section = section, .paragraph = target.paragraph, .start_unit = target.unit, .end_unit = target.unit, .utf8 = "사본검증😀" } }));
            const prefix = try std.unicode.utf8ToUtf16LeAlloc(a, "사본검증😀");
            defer a.free(prefix);
            const current = try opened.session.copyText(a, section, target.paragraph);
            defer a.free(current);
            try std.testing.expect(std.mem.startsWith(u8, current[@as(usize, target.unit) * 2 ..], std.mem.sliceAsBytes(prefix)));
        }
        try std.testing.expectEqual(row.paragraphs, paragraphs);
        const changed = try opened.session.save(a, .{ .allow_stale_layout = true });
        defer a.free(changed.bytes);
        var verified = try Source.open(a, changed.bytes);
        defer verified.deinit();
        try std.testing.expectEqual(row.available, verified.declared_section_count);
        const version = verified.header.version();
        var version_buffer: [32]u8 = undefined;
        try std.testing.expectEqualStrings(row.version, try std.fmt.bufPrint(&version_buffer, "{d}.{d}.{d}.{d}", .{ version.major(), version.minor(), version.patch(), version.revision() }));
        for (0..row.available) |_| try std.testing.expect(try history.undo(opened.session));
        const undone = try opened.session.save(a, .{});
        defer a.free(undone.bytes);
        try std.testing.expectEqualSlices(u8, baseline.bytes, undone.bytes);
        for (0..row.available) |_| try std.testing.expect(try history.redo(opened.session));
        const redone = try opened.session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, changed.bytes, redone.bytes);
        const disk = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64 * 1024 * 1024));
        defer a.free(disk);
        try std.testing.expectEqualSlices(u8, input, disk);
        std.debug.print("available copy fixture {s}: declared={d} stored={d} paragraphs={d} root-text edits={d}, normalized undo/redo verified\n", .{ row.path, row.declared, row.available, paragraphs, row.available });
    }
}
