const std = @import("std");
const t = std.testing;
const f = @import("test_fixture.zig");
const bmp = @import("pixels.zig");
const structure = @import("structure.zig");
const header = @import("header.zig");
const Channels = @import("masks.zig").Channels;
const options: bmp.Options = .{ .colour_management = .unmanaged, .mask_scaling = .nearest_normalized };

fn owned(a: std.mem.Allocator) !void {
    var raw = f.plain;
    var result = try bmp.decode(a, &raw, options);
    defer result.deinit(a);
    @memset(&raw, 0);
    try t.expectEqual(@as(u32, 2), result.width);
    try t.expectEqual(@as(u32, 2), result.height);
    try t.expectEqualSlices(u8, &f.rgba, result.rgba);
    try t.expect(result.metadata_deferred);
}
test "BMP owns top-down RGBA and never interprets unused BI_RGB high bytes as alpha" {
    try owned(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, owned, .{});
    var top = f.plain;
    f.put(&top, 22, i32, -2);
    var image = try bmp.decode(t.allocator, &top, options);
    defer image.deinit(t.allocator);
    try t.expectEqualSlices(u8, f.rgba[8..], image.rgba[0..8]);
    try t.expectEqualSlices(u8, f.rgba[0..8], image.rgba[8..]);
}

test "BMP headers preserve absent core fields and V4 V5 raw colour values" {
    const core = [_]u8{ 12, 0, 0, 0, 3, 0, 5, 0, 1, 0, 24, 0 };
    const old = try header.parse(&core, .{});
    try t.expect(old.info == null and old.colour == null and old.profile == null);
    try t.expectEqual(@as(u32, 5), old.height);
    const raw = try f.extended(t.allocator, 124);
    defer t.allocator.free(raw);
    f.put(raw, 14 + 56, u32, 0x4d424544); // PROFILE_EMBEDDED, transport still deferred.
    f.put(raw, 14 + 60, i32, std.math.minInt(i32));
    f.put(raw, 14 + 96, u32, 0xffff0001);
    f.put(raw, 14 + 108, u32, 8);
    f.put(raw, 14 + 112, u32, 0xffffffff);
    const parsed = try structure.inspect(raw, .{});
    try t.expectEqual(@as(i32, std.math.minInt(i32)), parsed.header.colour.?.endpoints[0]);
    try t.expectEqual(@as(u32, 0xffff0001), parsed.header.colour.?.gamma[0]);
    try t.expectEqual(@as(u32, 0xffffffff), parsed.header.profile.?.offset);
    try t.expect(parsed.metadata_deferred);
    try t.expectEqual(@as(u32, 0), parsed.header.info.?.image_bytes);
    f.put(raw, 14 + 120, u32, 1);
    try t.expectError(error.InvalidBmpReserved, structure.inspect(raw, .{}));
}

test "BMP raw layout bounds size offsets stride and trailing data independently" {
    for (0..f.plain.len) |n| {
        if (bmp.decode(t.allocator, f.plain[0..n], options)) |value| {
            var bad = value;
            bad.deinit(t.allocator);
            return error.UnexpectedValidTruncation;
        } else |_| {}
    }
    var bad = f.plain;
    f.put(&bad, 10, u32, 53);
    try t.expectError(error.InvalidBmpPixelOffset, structure.inspect(&bad, .{}));
    bad = f.plain;
    f.put(&bad, 34, u32, 15);
    try t.expectError(error.InvalidBmpImageSize, structure.inspect(&bad, .{}));
    bad = f.plain;
    f.put(&bad, 34, u32, 16);
    _ = try structure.inspect(&bad, .{});
    const tail = f.plain ++ .{ 1, 2, 3 };
    try t.expectError(error.TrailingBmpBytes, structure.inspect(&tail, .{}));
    const allowed = try structure.inspect(&tail, .{ .allow_trailing_bytes = true });
    try t.expectEqualSlices(u8, &.{ 1, 2, 3 }, allowed.trailing);
    try t.expectEqual(@as(u64, 12), structure.rowStride(3, 24));
    try t.expectEqual(@as(u64, 4), structure.rowStride(17, 1));
}

test "BMP independent budgets reject before allocation and signed minimum never overflows" {
    var fail = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    var bounded = options;
    bounded.max_rgba_bytes = 15;
    try t.expectError(error.LimitExceeded, bmp.decode(fail.allocator(), &f.plain, bounded));
    try t.expectError(error.LimitExceeded, structure.inspect(&f.plain, .{ .max_bytes = f.plain.len - 1 }));
    try t.expectError(error.LimitExceeded, structure.inspect(&f.plain, .{ .header = .{ .max_pixels = 3 } }));
    try t.expectError(error.LimitExceeded, structure.inspect(&f.plain, .{ .max_pixel_bytes = 15 }));
    var large = f.plain;
    f.put(&large, 22, i32, std.math.minInt(i32));
    try t.expectError(error.LimitExceeded, header.parse(large[14..], .{}));
    const h = try header.parse(large[14..], .{ .max_pixels = std.math.maxInt(u64) });
    try t.expectEqual(@as(u32, 2147483648), h.height);
    try t.expect(h.top_down);
}

test "BMP bit masks reject missing disjoint noncontiguous and oversized channels" {
    try t.expectError(error.InvalidBmpMask, Channels.init(.{ 0, 0xff00, 255, 0 }, 32));
    try t.expectError(error.OverlappingBmpMasks, Channels.init(.{ 0xff00, 0xff00, 255, 0 }, 32));
    try t.expectError(error.InvalidBmpMask, Channels.init(.{ 0x5000, 0xff0, 15, 0 }, 16));
    try t.expectError(error.InvalidBmpMask, Channels.init(.{ 0xff0000, 0xff00, 255, 0 }, 16));
    const c = try Channels.init(.{ 0xf800, 0x7e0, 0x1f, 0 }, 16);
    try t.expectEqualSlices(u8, &.{ 255, 255, 255, 255 }, &c.rgba(0xffff, .nearest_normalized));
    try t.expectEqualSlices(u8, &.{ 25, 0, 0, 255 }, &c.rgba(3 << 11, .nearest_normalized));
}

test "BMP 1 4 8 bit palette indexing ignores unused nibble and row padding" {
    const Palette = @import("palette.zig").Palette;
    const p = try Palette.init(&.{ 3, 2, 1, 0, 6, 5, 4, 0 }, 4);
    try t.expectEqualSlices(u8, &.{ 4, 5, 6, 255 }, &(try p.rgba(1)));
    try t.expectError(error.InvalidBmpPaletteIndex, p.rgba(2));
    try t.expectError(error.InvalidBmpReserved, Palette.init(&.{ 3, 2, 1, 255 }, 4));
    var raw = f.indexed();
    for ([_]u16{ 1, 4, 8 }) |bits| {
        f.put(&raw, 28, u16, bits);
        @memset(raw[62..], 255);
        raw[62] = if (bits == 1) 0xff else if (bits == 4) 0x1f else 1;
        var result = try bmp.decode(t.allocator, &raw, options);
        defer result.deinit(t.allocator);
        try t.expectEqualSlices(u8, &.{ 4, 5, 6, 255 }, result.rgba);
    }
}

fn invalidIndex(a: std.mem.Allocator) !void {
    var raw = f.indexed();
    raw[62] = 2;
    var image = bmp.decode(a, &raw, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.InvalidBmpPaletteIndex, err);
        return;
    };
    defer image.deinit(a);
    return error.UnexpectedValidPaletteIndex;
}
test "BMP post-allocation pixel validation frees output on every failure path" {
    try invalidIndex(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, invalidIndex, .{});
    // std.testing.allocator inherits runtime_safety; force accounting even in
    // ReleaseFast so removing cleanup cannot silently pass the leak gate.
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try owned(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try invalidIndex(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "BMP V4 bitfield alpha and INFO RGB555 use explicit normalized scaling" {
    const raw = try f.extended(t.allocator, 108);
    defer t.allocator.free(raw);
    f.put(raw, 30, u32, 3);
    f.put(raw, 34, u32, 16);
    for ([_]u32{ 0xff0000, 0xff00, 255, 0xff000000 }, 0..) |mask, i| f.put(raw, 54 + i * 4, u32, mask);
    var image = try bmp.decode(t.allocator, raw, options);
    defer image.deinit(t.allocator);
    try t.expectEqualSlices(u8, &.{ 10, 20, 30, 255, 40, 50, 60, 91, 70, 80, 90, 0, 100, 110, 120, 7 }, image.rgba);
    var rgb555 = f.plain;
    f.put(&rgb555, 28, u16, 16);
    f.put(&rgb555, 2, u32, 62);
    @memset(rgb555[54..62], 255);
    var rgb = try bmp.decode(t.allocator, rgb555[0..62], options);
    defer rgb.deinit(t.allocator);
    for (rgb.rgba) |channel| try t.expectEqual(@as(u8, 255), channel);
}
