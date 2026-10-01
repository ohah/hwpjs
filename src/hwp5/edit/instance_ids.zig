//! New serialized paragraph IDs, not model identity or source node indexes.
const std = @import("std");
const Version = @import("../version.zig").Version;
const framing = @import("../record.zig");
const Header = @import("../body/paragraph_header.zig").Header;
const Tag = @import("../body/reader.zig").Tag;

/// All sections and additional current-model IDs must be supplied by the caller.
/// Existing duplicates/zero are retained; only the returned positive ID is new.
pub fn fromSections(a: std.mem.Allocator, sections: []const []const u8, version: Version, additional: []const u32, max_ids: usize) !u32 {
    try version.requireSupported();
    if (additional.len > max_ids) return error.LimitExceeded;
    var ids: std.ArrayList(u32) = .empty;
    defer ids.deinit(a);
    try ids.appendSlice(a, additional);
    for (sections) |section| {
        var it = framing.Iterator.init(section, .{});
        while (try it.next()) |record| {
            if (record.tag != @intFromEnum(Tag.paragraph_header)) continue;
            if (ids.items.len >= max_ids) return error.LimitExceeded;
            const header = try Header.parse(record.payload, version);
            try ids.append(a, header.instance_id);
        }
    }
    std.mem.sort(u32, ids.items, {}, std.sort.asc(u32));
    return lowest(ids.items, std.math.maxInt(u32));
}

fn lowest(sorted: []const u32, max: u32) !u32 {
    if (max == 0) return error.InstanceIdExhausted;
    var candidate: u32 = 1;
    for (sorted) |id| {
        if (id < candidate) continue;
        if (id > candidate) return candidate;
        if (candidate == max) return error.InstanceIdExhausted;
        candidate += 1;
    }
    return candidate;
}

test "paragraph instance IDs find gaps duplicates zero and exhaustion without wrapping" {
    try std.testing.expectEqual(@as(u32, 1), try lowest(&.{}, 3));
    try std.testing.expectEqual(@as(u32, 3), try lowest(&.{ 0, 1, 1, 2, 4, 0xffffffff }, 0xffffffff));
    try std.testing.expectEqual(@as(u32, 1), try lowest(&.{0xffffffff}, 0xffffffff));
    try std.testing.expectError(error.InstanceIdExhausted, lowest(&.{ 0, 1, 1, 2, 3 }, 3));
    try std.testing.expectError(error.InstanceIdExhausted, lowest(&.{}, 0));
    const a = std.testing.allocator;
    try std.testing.expectError(error.UnsupportedVersion, fromSections(a, &.{}, .{ .raw = 0x06000000 }, &.{}, 0));
    try std.testing.expectError(error.LimitExceeded, fromSections(a, &.{}, .{ .raw = 0x05000000 }, &.{1}, 0));
    const truncated = [_][]const u8{&.{1}};
    try std.testing.expectError(error.UnexpectedEnd, fromSections(a, &truncated, .{ .raw = 0x05000000 }, &.{}, 10));
}

test "paragraph instance IDs scan actual nested fixture and preserve source on allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const before = try a.dupe(u8, raw);
    defer a.free(before);
    const sections = [_][]const u8{raw};
    const id = try fromSections(a, &sections, source.header.version(), &.{}, 1000);
    try std.testing.expect(id > 0);
    var it = framing.Iterator.init(raw, .{});
    var count: usize = 0;
    while (try it.next()) |record| {
        if (record.tag != @intFromEnum(Tag.paragraph_header)) continue;
        count += 1;
        try std.testing.expect((try Header.parse(record.payload, source.header.version())).instance_id != id);
    }
    try std.testing.expectEqual(@as(usize, 101), count);
    const next = try fromSections(a, &sections, source.header.version(), &.{id}, 1000);
    try std.testing.expect(next != id);
    try std.testing.expectError(error.LimitExceeded, fromSections(a, &sections, source.header.version(), &.{}, 100));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: Version) !void {
            const selected = [_][]const u8{bytes};
            _ = try fromSections(allocator, &selected, version, &.{ 1, 2 }, 1000);
        }
    }.run, .{ raw, source.header.version() });
    try std.testing.expectEqualSlices(u8, before, raw);
}
