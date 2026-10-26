//! New serialized paragraph IDs, not model identity or source node indexes.
const std = @import("std");
const Version = @import("../version.zig").Version;
const framing = @import("../record.zig");
const Header = @import("../body/paragraph_header.zig").Header;
const Tag = @import("../body/reader.zig").Tag;

/// All sections and additional current-model IDs must be supplied by the caller.
/// Existing duplicates/zero are retained; only the returned positive ID is new.
pub fn fromSections(a: std.mem.Allocator, sections: []const []const u8, version: Version, additional: []const u32, max_ids: usize) !u32 {
    const ids = try collect(a, sections, version, additional, max_ids);
    defer a.free(ids);
    return lowest(ids, std.math.maxInt(u32));
}

/// Plans, never reserves. max_ids bounds existing inventory and requested output
/// independently. Caller includes all current generated IDs in additional.
pub fn manyFromSections(a: std.mem.Allocator, sections: []const []const u8, version: Version, additional: []const u32, count: usize, max_ids: usize) ![]u32 {
    try version.requireSupported();
    if (count > max_ids) return error.LimitExceeded;
    const ids = try collect(a, sections, version, additional, max_ids);
    defer a.free(ids);
    const output = try a.alloc(u32, count);
    errdefer a.free(output);
    var cursor: Cursor = .{ .sorted = ids, .max = std.math.maxInt(u32) };
    for (output) |*id| id.* = try cursor.next();
    return output;
}

fn collect(a: std.mem.Allocator, sections: []const []const u8, version: Version, additional: []const u32, max_ids: usize) ![]u32 {
    try version.requireSupported();
    if (additional.len > max_ids) return error.LimitExceeded;
    var ids: std.ArrayList(u32) = .empty;
    defer ids.deinit(a);
    try ids.appendSlice(a, additional);
    for (sections) |section| {
        var it = framing.Iterator.init(section, .{});
        while (try it.next()) |record| {
            if (record.tag != @backingInt(Tag.paragraph_header)) continue;
            if (ids.items.len >= max_ids) return error.LimitExceeded;
            const header = try Header.parse(record.payload, version);
            try ids.append(a, header.instance_id);
        }
    }
    std.mem.sort(u32, ids.items, {}, std.sort.asc(u32));
    return ids.toOwnedSlice(a);
}

fn lowest(sorted: []const u32, max: u32) !u32 {
    var cursor: Cursor = .{ .sorted = sorted, .max = max };
    return cursor.next();
}

const Cursor = struct {
    sorted: []const u32,
    max: u32,
    index: usize = 0,
    candidate: u32 = 1,
    exhausted: bool = false,
    fn next(self: *Cursor) !u32 {
        if (self.exhausted or self.max == 0) return error.InstanceIdExhausted;
        while (self.index < self.sorted.len) {
            const id = self.sorted[self.index];
            if (id > self.candidate) break;
            self.index += 1;
            if (id < self.candidate) continue;
            if (self.candidate == self.max) {
                self.exhausted = true;
                return error.InstanceIdExhausted;
            }
            self.candidate += 1;
        }
        const result = self.candidate;
        if (result == self.max) self.exhausted = true else self.candidate += 1;
        return result;
    }
};

test "paragraph instance IDs batch cursor consumes gaps and refuses exhausted reuse" {
    var cursor: Cursor = .{ .sorted = &.{ 0, 1, 1, 3, 6, 0xffffffff }, .max = 5 };
    for ([_]u32{ 2, 4, 5 }) |expected| try std.testing.expectEqual(expected, try cursor.next());
    try std.testing.expectError(error.InstanceIdExhausted, cursor.next());
    var occupied: Cursor = .{ .sorted = &.{1}, .max = 1 };
    try std.testing.expectError(error.InstanceIdExhausted, occupied.next());
    try std.testing.expectError(error.InstanceIdExhausted, occupied.next());
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
    const planned = try manyFromSections(a, &sections, source.header.version(), &.{}, 6, 1000);
    defer a.free(planned);
    const repeated = try manyFromSections(a, &sections, source.header.version(), &.{}, 6, 1000);
    defer a.free(repeated);
    try std.testing.expectEqualSlices(u32, planned, repeated);
    try std.testing.expectEqual(id, planned[0]);
    for (planned[1..], planned[0 .. planned.len - 1]) |current, previous| try std.testing.expect(current > previous);
    var it = framing.Iterator.init(raw, .{});
    var count: usize = 0;
    while (try it.next()) |record| {
        if (record.tag != @backingInt(Tag.paragraph_header)) continue;
        count += 1;
        const existing = (try Header.parse(record.payload, source.header.version())).instance_id;
        try std.testing.expect(existing != id);
        try std.testing.expect(std.mem.indexOfScalar(u32, planned, existing) == null);
    }
    try std.testing.expectEqual(@as(usize, 101), count);
    const next = try fromSections(a, &sections, source.header.version(), &.{id}, 1000);
    try std.testing.expect(next != id);
    try std.testing.expectEqual(next, planned[1]);
    const after = try manyFromSections(a, &sections, source.header.version(), planned, 6, 1000);
    defer a.free(after);
    for (after) |current| try std.testing.expect(std.mem.indexOfScalar(u32, planned, current) == null);
    try std.testing.expectError(error.LimitExceeded, fromSections(a, &sections, source.header.version(), &.{}, 100));
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: Version) !void {
            const selected = [_][]const u8{bytes};
            _ = try fromSections(allocator, &selected, version, &.{ 1, 2 }, 1000);
        }
    }.run, .{ raw, source.header.version() });
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: Version) !void {
            const selected = [_][]const u8{bytes};
            const ids = try manyFromSections(allocator, &selected, version, &.{ 0, 1, 1 }, 6, 1000);
            defer allocator.free(ids);
            try std.testing.expectEqual(@as(usize, 6), ids.len);
        }
    }.run, .{ raw, source.header.version() });
    try std.testing.expectEqualSlices(u8, before, raw);
}

test "paragraph instance IDs batch validates empty requests and output budgets" {
    const a = std.testing.allocator;
    const empty = try manyFromSections(a, &.{}, .{ .raw = 0x05000000 }, &.{}, 0, 0);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    try std.testing.expectError(error.LimitExceeded, manyFromSections(a, &.{}, .{ .raw = 0x05000000 }, &.{}, 2, 1));
    try std.testing.expectError(error.LimitExceeded, manyFromSections(a, &.{}, .{ .raw = 0x05000000 }, &.{ 1, 2 }, 0, 1));
    try std.testing.expectError(error.UnexpectedEnd, manyFromSections(a, &.{&.{1}}, .{ .raw = 0x05000000 }, &.{}, 0, 1));
    try std.testing.expectError(error.UnsupportedVersion, manyFromSections(a, &.{}, .{ .raw = 0x06000000 }, &.{}, 0, 0));
}
