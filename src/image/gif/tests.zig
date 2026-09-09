const std = @import("std");
const gif = @import("document.zig");
const sub = @import("sub_blocks.zig");
const Reader = @import("../../binary/reader.zig").Reader;
const a = std.testing.allocator;
const tiny = [_]u8{ 'G', 'I', 'F', '8', '9', 'a', 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 59 };
fn checkAlloc(allocator: std.mem.Allocator) !void {
    var d = try gif.decode(allocator, &tiny, .{});
    defer d.deinit(allocator);
    try std.testing.expectEqualSlices(u8, &.{0}, d.frames[0].raster.indices);
}
fn checkFailure(allocator: std.mem.Allocator) !void {
    var bad = tiny;
    bad[34] = 0;
    var d = gif.decode(allocator, &bad, .{}) catch |err| switch (err) {
        error.InvalidGifBlock => return,
        else => return err,
    };
    defer d.deinit(allocator);
    return error.ExpectedFailure;
}
test "gif sub-block boundaries are borrowed bounded and atomic" {
    const bytes = [_]u8{ 1, 0x44, 1, 1, 0, 99 };
    for (0..5) |n| {
        var r: Reader = .{ .bytes = bytes[0..n] };
        try std.testing.expectError(error.UnexpectedEnd, sub.read(&r, 2));
        try std.testing.expectEqual(@as(usize, 0), r.offset);
    }
    var r: Reader = .{ .bytes = &bytes };
    try std.testing.expectError(error.LimitExceeded, sub.read(&r, 1));
    try std.testing.expectEqual(@as(usize, 0), r.offset);
    const view = try sub.read(&r, 2);
    try std.testing.expectEqual(@as(usize, 5), r.offset);
    try std.testing.expectEqual(@as(usize, 2), view.payload_bytes);
    var it = view.iterator();
    try std.testing.expectEqualSlices(u8, &.{0x44}, (try it.next()).?);
    try std.testing.expectEqualSlices(u8, &.{1}, (try it.next()).?);
    try std.testing.expectEqual(null, try it.next());
    try std.testing.expectEqual(null, try it.next());
}
test "gif indexed decode owns pixels and preserves absent palette" {
    try checkAlloc(a);
    var no_palette: [29]u8 = undefined;
    @memcpy(no_palette[0..13], tiny[0..13]);
    no_palette[10] = 0;
    @memcpy(no_palette[13..], tiny[19..]);
    var d = try gif.decode(a, &no_palette, .{});
    defer d.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), d.unresolved_color_frames);
    try std.testing.expect(d.rendering_deferred);
    try std.testing.expect(!d.frames[0].raster.colors_resolved);
    try std.testing.expectEqual(@as(usize, 3), d.total_codes);
    try std.testing.expectEqual(@as(usize, 1), d.total_pixels);
    try std.testing.expectEqual(@as(usize, 2), d.blocks);
}
test "gif KwKwK and omitted initial clear are decoded without invented resets" {
    var b = tiny;
    b[6] = 3;
    b[24] = 3;
    b[31] = 0x84;
    b[32] = 0x0b;
    var d = try gif.decode(a, &b, .{});
    defer d.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 0, 0, 0 }, d.frames[0].raster.indices);
    try std.testing.expect(d.frames[0].raster.lzw.initial_clear);
    var omitted: [34]u8 = undefined;
    @memcpy(omitted[0..30], tiny[0..30]);
    @memcpy(omitted[30..], &[_]u8{ 1, 0x28, 0, 59 });
    var p = try gif.decode(a, &omitted, .{});
    defer p.deinit(a);
    try std.testing.expect(!p.frames[0].raster.lzw.initial_clear);
    try std.testing.expectEqual(@as(usize, 0), p.frames[0].raster.lzw.clears);
}
test "gif graphics control crosses comments but is consumed by plain text" {
    const gce = [_]u8{ 0x21, 0xf9, 4, 0x1f, 0x34, 0x12, 1, 0 };
    const comment = [_]u8{ 0x21, 0xfe, 1, 65, 0 };
    const text = [_]u8{ 0x21, 1, 12 } ++ [_]u8{0} ** 12 ++ [_]u8{0};
    const raw = tiny[0..19].* ++ gce ++ comment ++ text ++ tiny[19..].*;
    var d = try gif.decode(a, &raw, .{});
    defer d.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), d.comments);
    try std.testing.expectEqual(@as(usize, 1), d.plain_texts);
    try std.testing.expectEqual(@as(usize, 1), d.reserved_disposals);
    try std.testing.expectEqual(null, d.frames[0].image.control);
    var it = try gif.blocks.Iterator.init(&raw, .{});
    const c = (try it.next()).?.control;
    try std.testing.expectEqual(@as(u16, 0x1234), c.delay);
    _ = try it.next();
    const text_control = (try it.next()).?.text.control;
    try std.testing.expect(text_control != null);
    try std.testing.expectEqual(c, text_control.?);
    const linked = tiny[0..19].* ++ gce ++ comment ++ tiny[19..].*;
    var pair = try gif.decode(a, &linked, .{});
    defer pair.deinit(a);
    try std.testing.expect(pair.frames[0].image.control != null);
    try std.testing.expectEqual(c, pair.frames[0].image.control.?);
}
test "gif extension and trailer failures preserve iterator state" {
    const gce = [_]u8{ 0x21, 0xf9, 4, 0, 0, 0, 0, 0 };
    const duplicate = tiny[0..19].* ++ gce ++ gce ++ tiny[19..].*;
    var it = try gif.blocks.Iterator.init(&duplicate, .{});
    _ = try it.next();
    const before = it;
    try std.testing.expectError(error.DuplicateGifControl, it.next());
    try std.testing.expectEqualDeep(before, it);
    const dangling = tiny[0..19].* ++ gce ++ [_]u8{59};
    try std.testing.expectError(error.UnconsumedGifControl, gif.decode(a, &dangling, .{}));
    const tail = tiny ++ [_]u8{99};
    try std.testing.expectError(error.TrailingGifBytes, gif.decode(a, &tail, .{}));
    var d = try gif.decode(a, &tail, .{ .structure = .{ .allow_trailing_bytes = true } });
    defer d.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), d.trailing_bytes);
    var version = tiny;
    version[4] = '7';
    var old = try gif.decode(a, &version, .{});
    old.deinit(a);
    version[12] = 1;
    try std.testing.expectError(error.InvalidGifVersionFeature, gif.decode(a, &version, .{}));
}
test "gif all file prefixes and raster code pixel bounds fail cleanly" {
    for (0..tiny.len) |n| {
        if (gif.decode(a, tiny[0..n], .{})) |result| {
            var d = result;
            d.deinit(a);
            return error.AcceptedTruncation;
        } else |err| {
            try std.testing.expect(err == error.UnexpectedEnd);
        }
    }
    var b = tiny;
    b[31] = 0x54; // clear, palette index 2, EOI
    try std.testing.expectError(error.InvalidGifPaletteIndex, gif.decode(a, &b, .{}));
    b = tiny;
    b[31] = 0x7c; // code 7 before a previous string exists
    try std.testing.expectError(error.InvalidGifLzwCode, gif.decode(a, &b, .{}));
    b = tiny;
    b[6] = 2;
    b[24] = 2; // complete LZW, but only one of two declared pixels
    try std.testing.expectError(error.IncompleteGifPixels, gif.decode(a, &b, .{}));
    b = tiny;
    b[31] = 0x84;
    b[32] = 0x0b;
    try std.testing.expectError(error.ExcessGifPixels, gif.decode(a, &b, .{}));
    for ([_]gif.Options{ .{ .max_frames = 0 }, .{ .max_total_pixels = 0 }, .{ .max_total_codes = 2 }, .{ .structure = .{ .max_bytes = tiny.len - 1 } }, .{ .structure = .{ .max_blocks = 1 } }, .{ .structure = .{ .max_sub_blocks = 0 } } }) |options| try std.testing.expectError(error.LimitExceeded, gif.decode(a, &tiny, options));
}
test "gif OOM and post-frame error release allocations in every build mode" {
    try std.testing.checkAllAllocationFailures(a, checkAlloc, .{});
    try std.testing.checkAllAllocationFailures(a, checkFailure, .{});
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = gpa.deinit();
    try checkFailure(gpa.allocator());
    try std.testing.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    try checkAlloc(gpa.allocator());
    try std.testing.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}

test "gif interlace all small heights and full frozen dictionary match literal ordinals" {
    for (1..34) |height| {
        const bytes = try @import("fixtures.zig").literals(a, 3, @intCast(height), true);
        defer a.free(bytes);
        var d = try gif.decode(a, bytes, .{});
        defer d.deinit(a);
        for (0..height) |y| {
            const ordinal = if (y % 8 == 0) y / 8 else if (y % 8 == 4) (height + 7) / 8 + y / 8 else if (y % 4 == 2) (height + 7) / 8 + (height + 3) / 8 + y / 4 else (height + 7) / 8 + (height + 3) / 8 + (height + 1) / 4 + y / 2;
            for (0..3) |x| try std.testing.expectEqual(@as(u8, @intCast((ordinal * 3 + x) % 2)), d.frames[0].raster.indices[y * 3 + x]);
        }
    }
    const bytes = try @import("fixtures.zig").literals(a, 10000, 1, false);
    defer a.free(bytes);
    var d = try gif.decode(a, bytes, .{});
    defer d.deinit(a);
    for (d.frames[0].raster.indices, 0..) |n, i| try std.testing.expectEqual(@as(u8, @intCast(i % 2)), n);
    try std.testing.expectEqual(@as(u4, 12), d.frames[0].raster.lzw.maximum_width);
    try std.testing.expectEqual(@as(usize, 1), d.frames[0].raster.lzw.clears);
    try std.testing.expectEqual(@as(usize, 10002), d.total_codes);
}

test "gif repeated frames share budgets and failed later frames free earlier rasters" {
    const two = tiny[0..34].* ++ tiny[19..].*;
    var d = try gif.decode(a, &two, .{ .max_total_pixels = 2, .max_total_codes = 6, .max_frames = 2 });
    defer d.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), d.frames.len);
    try std.testing.expectEqual(@as(usize, 2), d.total_pixels);
    try std.testing.expectEqual(@as(usize, 6), d.total_codes);
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = gpa.deinit();
    for ([_]gif.Options{ .{ .max_total_pixels = 1 }, .{ .max_total_codes = 5 }, .{ .max_frames = 1 }, .{ .structure = .{ .max_sub_blocks = 1 } } }) |options| {
        try std.testing.expectError(error.LimitExceeded, gif.decode(gpa.allocator(), &two, options));
        try std.testing.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
    var pad = tiny;
    pad[32] = 255;
    var p = try gif.decode(a, &pad, .{});
    defer p.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{0}, p.frames[0].raster.indices);
}

test "gif fixed extension headers and data remain borrowed without normalization" {
    const fixed = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
    const application = [_]u8{ 33, 255, 11 } ++ "APPNAME1".* ++ [_]u8{ 0, 255, 128, 1, 0xff, 0 };
    const text = [_]u8{ 33, 1, 12 } ++ fixed ++ [_]u8{ 1, 65, 0 };
    const raw = tiny[0..19].* ++ application ++ text ++ tiny[19..].*;
    var it = try gif.blocks.Iterator.init(&raw, .{});
    const app = (try it.next()).?.application;
    try std.testing.expectEqualSlices(u8, application[3..14], app.header);
    try std.testing.expectEqualSlices(u8, &.{ 1, 255, 0 }, app.data.raw);
    const value = (try it.next()).?.text;
    try std.testing.expectEqualSlices(u8, &fixed, value.header);
    try std.testing.expectEqualSlices(u8, &.{ 1, 65, 0 }, value.data.raw);
    try std.testing.expect(value.header.ptr == raw[application.len + 22 ..].ptr);
}
