const std = @import("std");
const t = std.testing;
const palette = @import("suggested_palette.zig");
const Collector = @import("suggested_palettes.zig").Collector;
const fixture = @import("suggested_fixture.zig");
const Chunk = @import("chunks.zig").Chunk;
fn chunk(raw: []const u8) Chunk {
    return .{ .name = "sPLT".*, .payload = raw, .raw = &.{} };
}
test "PNG suggested palette depth framing borrowing empty and unbounded count" {
    var empty = [_]u8{ 'K', 0, 8 };
    for (0..256) |depth| {
        empty[2] = @intCast(depth);
        if (depth == 8 or depth == 16) {
            const v = try palette.parse(&empty);
            try t.expectEqual(@as(usize, 0), v.count());
            try t.expect(v.get(0) == null);
        } else try t.expectError(error.InvalidPngSuggestedDepth, palette.parse(&empty));
    }
    for ([_]u8{ 8, 16 }) |depth| {
        const raw = try fixture.payload(t.allocator, "Name", depth, &.{ .{ 1, 2, 3, 4, 65535 }, .{ 5, 6, 7, 8, 0 } });
        defer t.allocator.free(raw);
        const v = try palette.parse(raw);
        try t.expectEqual(@intFromPtr(raw.ptr), @intFromPtr(v.name.ptr));
        try t.expectEqual(@as(usize, 2), v.count());
        try t.expectEqual([4]u16{ 5, 6, 7, 8 }, v.get(1).?.rgba);
        try t.expectEqual(@as(usize, 1), v.zero_frequencies);
        try t.expect(v.get(std.math.maxInt(usize)) == null);
        for (0..raw.len) |len| {
            const header: usize = 6;
            const width: usize = if (depth == 8) 6 else 10;
            if (len >= header and (len - header) % width == 0) _ = try palette.parse(raw[0..len]) else {
                if (palette.parse(raw[0..len])) |_| return error.ExpectedFailure else |_| {}
            }
        }
    }
    const entries = try t.allocator.alloc([5]u16, 1024);
    defer t.allocator.free(entries);
    @memset(entries, .{ 1, 2, 3, 0, 0 });
    const raw = try fixture.payload(t.allocator, "Large", 8, entries);
    defer t.allocator.free(raw);
    const v = try palette.parse(raw);
    try t.expectEqual(@as(usize, 1024), v.count());
    try t.expectEqual(@as(usize, 1024), v.zero_frequencies);
}
test "PNG suggested palette full u16 samples and frequency order boundaries" {
    var raw = [_]u8{ 'K', 0, 16 } ++ [_]u8{0} ** 10;
    for (0..65536) |n| {
        const v: u16 = @intCast(n);
        for (0..5) |i| std.mem.writeInt(u16, raw[3 + i * 2 ..][0..2], v, .big);
        const e = (try palette.parse(&raw)).get(0).?;
        try t.expectEqual([4]u16{ v, v, v, v }, e.rgba);
        try t.expectEqual(v, e.frequency);
    }
    for ([_]u16{ 0, 1, 255, 256, 65534, 65535 }) |first| for ([_]u16{ 0, 1, 255, 256, 65534, 65535 }) |second| {
        const bytes = try fixture.payload(t.allocator, "K", 8, &.{ .{ 0, 1, 2, 3, first }, .{ 0, 1, 2, 3, second } });
        defer t.allocator.free(bytes);
        if (second <= first) _ = try palette.parse(bytes) else try t.expectError(error.InvalidPngSuggestedFrequencyOrder, palette.parse(bytes));
    };
}
test "PNG suggested palette collector case sensitive names order atomicity and overflow" {
    var c: Collector = .{};
    defer c.deinit(t.allocator);
    try c.consume(t.allocator, chunk("A\x00\x08"));
    try c.consume(t.allocator, chunk("a\x00\x10"));
    const before = c.stats;
    try t.expectError(error.DuplicatePngSuggestedName, c.consume(t.allocator, chunk("A\x00\x10")));
    try t.expectEqualDeep(before, c.stats);
    try t.expectEqual(@as(usize, 2), c.names.count());
    try c.consume(t.allocator, .{ .name = "IDAT".*, .payload = &.{}, .raw = &.{} });
    try t.expectError(error.InvalidPngSuggestedOrder, c.consume(t.allocator, chunk("B\x00\x08")));
    try t.expectEqualDeep(before, c.stats);
    var full: Collector = .{ .stats = .{ .entries = std.math.maxInt(usize) } };
    defer full.deinit(t.allocator);
    try t.expectError(error.LimitExceeded, full.consume(t.allocator, chunk("K\x00\x08" ++ "\x00" ** 6)));
    try t.expectEqual(@as(usize, 0), full.names.count());
}
fn allocations(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const pixels = @import("pixels.zig");
    const r = try pixels.inspect(a, good, .{});
    try t.expectEqual(@as(usize, 16), r.suggested_palettes.chunks);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.DuplicatePngSuggestedName, err),
    }
}
test "PNG suggested palette growing name index allocations and later failure cleanup" {
    const pf = @import("pixels_fixture.zig");
    var payloads: [16][3]u8 = undefined;
    var extras: [17]pf.Extra = undefined;
    for (&payloads, 0..) |*bytes, i| {
        bytes.* = .{ @as(u8, @intCast(i)) + 'A', 0, 8 };
        extras[i] = .{ .name = "sPLT", .bytes = bytes };
    }
    extras[16] = extras[0];
    const good = try pf.withMetadata(t.allocator, 0, extras[0..16]);
    defer t.allocator.free(good);
    const bad = try pf.withMetadata(t.allocator, 0, &extras);
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, allocations, .{ good, bad });
}
