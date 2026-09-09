const std = @import("std");
const t = std.testing;
const rle = @import("rle.zig");
const commands = rle.commands;
const raster = rle.raster;
const f = @import("rle_fixture.zig");
const Palette = @import("palette.zig").Palette;
const full_palette = Palette{ .bytes = &([_]u8{0} ** 1024), .entry_bytes = 4 };
const options: raster.Options = .{ .commands = .{ .padding = .require_zero }, .completion = .preserve_unwritten };

test "BMP RLE encoded and absolute runs cover every legal count" {
    for ([_]commands.Format{ .rle4, .rle8 }) |format| {
        for (1..256) |count| {
            const bytes = [_]u8{ @intCast(count), 0xab };
            var it = try commands.Iterator.init(&bytes, format, options.commands);
            const run = (try it.next()).?.run;
            for (0..count) |i| try t.expectEqual(@as(u8, if (format == .rle8) 0xab else if (i % 2 == 0) 10 else 11), try run.index(@intCast(i)));
            try t.expectError(error.InvalidBmpRleRunIndex, run.index(@intCast(count)));
            try t.expectEqual(@as(?commands.Command, null), try it.next());
        }
        for (3..256) |count| {
            var raw = [_]u8{0} ** 258;
            raw[1] = @intCast(count);
            const size = if (format == .rle8) count else (count + 1) / 2;
            for (0..size) |i| raw[2 + i] = @truncate(i * 19 + 7);
            var it = try commands.Iterator.init(raw[0 .. 2 + size + size % 2], format, options.commands);
            const run = (try it.next()).?.run;
            for (0..count) |i| {
                const value = raw[2 + (if (format == .rle8) i else i / 2)];
                try t.expectEqual(if (format == .rle8) value else if (i % 2 == 0) value >> 4 else value & 15, try run.index(@intCast(i)));
            }
            try t.expectEqual(@as(usize, 2 + size + size % 2), it.reader.offset);
            try t.expectEqual(@as(?commands.Command, null), try it.next());
        }
    }
}

test "BMP RLE command failure preserves iterator and padding presence" {
    const raw = [_]u8{ 0, 3, 7, 8, 9, 0 };
    for (1..raw.len) |n| {
        var it = try commands.Iterator.init(raw[0..n], .rle8, options.commands);
        try t.expectError(error.UnexpectedEnd, it.next());
        try t.expectEqual(@as(usize, 0), it.reader.offset);
        try t.expectEqual(@as(usize, 0), it.count);
    }
    var bad = raw;
    bad[5] = 123;
    var it = try commands.Iterator.init(&bad, .rle8, options.commands);
    try t.expectError(error.InvalidBmpRlePadding, it.next());
    try t.expectEqual(@as(usize, 0), it.reader.offset);
    it.options.padding = .preserve;
    try t.expectEqual(@as(?u8, 123), (try it.next()).?.run.padding);
    it = try commands.Iterator.init(&.{ 0, 2, 255 }, .rle4, options.commands);
    try t.expectError(error.UnexpectedEnd, it.next());
    try t.expectEqual(@as(usize, 0), it.reader.offset);
}

fn examples(a: std.mem.Allocator) !void {
    for ([_]u16{ 4, 8 }) |bits| {
        const raw = try f.bitmap(a, if (bits == 4) &f.example4 else &f.example8, bits, 32, 4);
        defer a.free(raw);
        var image = try rle.decode(a, raw, .{ .raster = options });
        defer image.deinit(a);
        @memset(raw, 0);
        try t.expectEqual(@as(usize, if (bits == 4) 31 else 24), image.written_pixels);
        try t.expectEqual(@as(usize, if (bits == 4) 97 else 104), image.unwritten_pixels);
        try t.expectEqual(@as(usize, 9), image.commands);
        try t.expectEqual(@as(usize, 24), image.consumed_bytes);
        for (image.indices[0..32]) |index| try t.expectEqual(raster.unwritten, index);
        try t.expectEqualSlices(u16, if (bits == 4) &.{ 0, 4, 0, 0, 6, 0, 6, 0, 4, 5, 5, 6, 6, 7, 7, 8, 7, 8 } else &.{ 4, 4, 4, 6, 6, 6, 6, 6, 0x45, 0x56, 0x67, 0x78, 0x78 }, image.indices[96..][0..if (bits == 4) @as(usize, 18) else 13]);
        const delta_x: usize = if (bits == 4) 23 else 18;
        try t.expectEqual(@as(u16, if (bits == 4) 7 else 0x78), image.indices[64 + delta_x]);
        try t.expectEqual(raster.unwritten, image.indices[64 + delta_x - 1]);
        try t.expectEqual(@as(u16, if (bits == 4) 1 else 0x1e), image.indices[32]);
    }
}
test "BMP RLE documented streams preserve gaps delta direction and owned indices" {
    try examples(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, examples, .{});
}

test "BMP RLE completion distinguishes missing pixels palette zero and EOB" {
    var strict = options;
    strict.completion = .require_full;
    try t.expectError(error.IncompleteBmpRleRaster, raster.decode(t.allocator, &.{ 0, 1 }, .rle8, 1, 1, full_palette, strict));
    var image = try raster.decode(t.allocator, &.{ 1, 0, 0, 0, 0, 1 }, .rle8, 1, 1, full_palette, strict);
    defer image.deinit(t.allocator);
    try t.expectEqualSlices(u16, &.{0}, image.indices);
    try t.expectEqual(@as(usize, 0), image.unwritten_pixels);
    try t.expectError(error.MissingBmpRleEnd, raster.decode(t.allocator, &.{ 1, 0 }, .rle8, 1, 1, full_palette, strict));
    try t.expectError(error.TrailingBmpRleBytes, raster.decode(t.allocator, &.{ 0, 1, 9 }, .rle8, 1, 1, full_palette, options));
    var trailing = options;
    trailing.allow_trailing_bytes = true;
    var partial = try raster.decode(t.allocator, &.{ 0, 1, 9 }, .rle8, 1, 1, full_palette, trailing);
    defer partial.deinit(t.allocator);
    try t.expectEqual(@as(usize, 1), partial.trailing_bytes);
    try t.expectEqual(@as(usize, 1), partial.unwritten_pixels);
    try t.expectEqualSlices(u16, &.{256}, partial.indices);
}

test "BMP RLE cursor rejects crossing lines and out of image movement" {
    for ([_][]const u8{ &.{ 2, 0, 0, 1 }, &.{ 0, 0, 1, 0, 0, 1 }, &.{ 0, 0, 0, 0, 0, 1 }, &.{ 0, 2, 2, 0, 0, 1 }, &.{ 0, 2, 0, 1, 0, 1 }, &.{ 0, 0, 0, 2, 0, 0, 0, 1 } }) |bytes| {
        try t.expectError(error.InvalidBmpRlePosition, raster.decode(t.allocator, bytes, .rle8, 1, 1, full_palette, options));
    }
    var image = try raster.decode(t.allocator, &.{ 0, 2, 0, 0, 0, 2, 1, 0, 0, 1 }, .rle8, 1, 1, full_palette, options);
    defer image.deinit(t.allocator);
    try t.expectEqual(@as(usize, 1), image.unwritten_pixels);
}

test "BMP RLE ignores unused nibble but checks all emitted palette indices" {
    const one = Palette{ .bytes = &.{ 0, 0, 0, 0 }, .entry_bytes = 4 };
    var image = try raster.decode(t.allocator, &.{ 1, 15, 0, 1 }, .rle4, 1, 1, one, options);
    defer image.deinit(t.allocator);
    try t.expectEqualSlices(u16, &.{0}, image.indices);
    try t.expectError(error.InvalidBmpPaletteIndex, raster.decode(t.allocator, &.{ 2, 15, 0, 1 }, .rle4, 2, 1, one, options));
    var odd = try raster.decode(t.allocator, &.{ 0, 3, 0, 15, 0, 1 }, .rle4, 3, 1, one, options);
    defer odd.deinit(t.allocator);
    try t.expectEqualSlices(u16, &.{ 0, 0, 0 }, odd.indices);
}

test "BMP RLE delta offsets are unsigned cumulative and preserve holes" {
    var far = try raster.decode(t.allocator, &.{ 0, 2, 255, 255, 1, 3, 0, 1 }, .rle8, 256, 256, full_palette, options);
    defer far.deinit(t.allocator);
    try t.expectEqual(@as(u16, 3), far.indices[255]);
    try t.expectEqual(@as(usize, 65535), far.unwritten_pixels);
    const raw = [_]u8{ 1, 0, 0, 2, 0, 1, 1, 1, 0, 2, 1, 1, 1, 2, 0, 1 };
    var diagonal = try raster.decode(t.allocator, &raw, .rle8, 4, 3, full_palette, options);
    defer diagonal.deinit(t.allocator);
    try t.expectEqualSlices(u16, &.{ 256, 256, 256, 2, 256, 1, 256, 256, 0, 256, 256, 256 }, diagonal.indices);
    try t.expectEqual(@as(usize, 3), diagonal.written_pixels);
}

test "BMP RLE input output command and file policies remain independent" {
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    var bounded = options;
    bounded.max_index_bytes = 1;
    try t.expectError(error.LimitExceeded, raster.decode(failing.allocator(), &.{ 0, 1 }, .rle8, 1, 1, full_palette, bounded));
    bounded = options;
    bounded.commands.max_bytes = 1;
    try t.expectError(error.LimitExceeded, raster.decode(failing.allocator(), &.{ 0, 1 }, .rle8, 1, 1, full_palette, bounded));
    bounded = options;
    bounded.commands.max_commands = 1;
    try t.expectError(error.LimitExceeded, raster.decode(t.allocator, &.{ 0, 2, 0, 0, 0, 1 }, .rle8, 1, 1, full_palette, bounded));
    try t.expectError(error.LimitExceeded, raster.decode(failing.allocator(), &.{ 0, 1 }, .rle8, std.math.maxInt(u32), std.math.maxInt(u32), full_palette, options));
    const raw = try f.bitmap(t.allocator, &.{ 1, 0, 0, 1 }, 8, 1, 1);
    defer t.allocator.free(raw);
    try t.expectError(error.LimitExceeded, rle.decode(failing.allocator(), raw, .{ .structure = .{ .max_bytes = raw.len - 1 }, .raster = options }));
    @import("test_fixture.zig").put(raw, 22, i32, -1);
    try t.expectError(error.InvalidBmpOrientation, rle.decode(t.allocator, raw, .{ .raster = options }));
}

fn invalid(a: std.mem.Allocator) !void {
    try t.expectError(error.InvalidBmpPaletteIndex, raster.decode(a, &.{ 1, 1, 0, 1 }, .rle8, 1, 1, .{ .bytes = &.{ 0, 0, 0, 0 }, .entry_bytes = 4 }, options));
}
test "BMP RLE explicit allocator accounting covers success and error cleanup" {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try examples(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try invalid(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
