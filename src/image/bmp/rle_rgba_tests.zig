const std = @import("std");
const t = std.testing;
const pixels = @import("pixels.zig");
const f = @import("rle_rgba_fixture.zig");

fn owned(a: std.mem.Allocator, bits: u16) !void {
    const raw = try f.bitmap(a, bits, false);
    defer a.free(raw);
    var image = try pixels.decode(a, raw, f.options);
    defer image.deinit(a);
    @memset(raw, 0);
    try t.expectEqualSlices(u8, &.{ 0, 0, 0, 0, 0, 0, 0, 0, 17, 11, 7, 255, 0, 0, 0, 0 }, image.rgba);
    const evidence = image.rle.?;
    try t.expectEqual(@as(usize, 1), evidence.written_pixels);
    try t.expectEqual(@as(usize, 3), evidence.unwritten_pixels);
    try t.expectEqual(@as(usize, 2), evidence.commands);
    try t.expectEqual(@as(usize, 4), evidence.consumed_bytes);
    try t.expectEqual(@as(usize, 0), evidence.trailing_bytes);
    try t.expectEqual(.transparent, evidence.unwritten);
    try t.expect(image.metadata_deferred);
}
test "BMP RLE RGBA keeps actual palette zero opaque and owns top-down output" {
    for ([_]u16{ 4, 8 }) |bits| {
        try owned(t.allocator, bits);
        try t.checkAllAllocationFailures(t.allocator, owned, .{bits});
    }
}

test "BMP RLE RGBA fill selection and raster completion are independent" {
    for ([_]u16{ 4, 8 }) |bits| {
        const raw = try f.bitmap(t.allocator, bits, false);
        defer t.allocator.free(raw);
        var options = f.options;
        options.rle.?.unwritten = .palette_zero;
        var image = try pixels.decode(t.allocator, raw, options);
        defer image.deinit(t.allocator);
        try t.expectEqualSlices(u8, &([_]u8{ 17, 11, 7, 255 } ** 4), image.rgba);
        try t.expectEqual(@as(usize, 3), image.rle.?.unwritten_pixels);
        options.rle.?.unwritten = .reject;
        try t.expectError(error.UnwrittenBmpRlePixels, pixels.decode(t.allocator, raw, options));
        options.rle.?.unwritten = .transparent;
        options.rle.?.raster.completion = .require_full;
        try t.expectError(error.IncompleteBmpRleRaster, pixels.decode(t.allocator, raw, options));
        const full = try f.bitmap(t.allocator, bits, true);
        defer t.allocator.free(full);
        inline for (.{ .reject, .palette_zero, .transparent }) |policy| {
            options.rle.?.unwritten = policy;
            var complete = try pixels.decode(t.allocator, full, options);
            defer complete.deinit(t.allocator);
            try t.expectEqualSlices(u8, &([_]u8{ 17, 11, 7, 255 } ** 4), complete.rgba);
            try t.expectEqual(@as(usize, 0), complete.rle.?.unwritten_pixels);
        }
    }
}

test "BMP RLE RGBA checks output before indices and forwards independent bounds" {
    const raw = try f.bitmap(t.allocator, 8, false);
    defer t.allocator.free(raw);
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    var options = f.options;
    options.max_rgba_bytes = 15;
    try t.expectError(error.LimitExceeded, pixels.decode(failing.allocator(), raw, options));
    for (0..4) |which| {
        options = f.options;
        switch (which) {
            0 => options.rle.?.raster.max_index_bytes = 7,
            1 => options.rle.?.raster.commands.max_bytes = 3,
            2 => options.structure.max_bytes = raw.len - 1,
            3 => options.structure.header.max_pixels = 3,
            else => unreachable,
        }
        try t.expectError(error.LimitExceeded, pixels.decode(failing.allocator(), raw, options));
    }
    options = f.options;
    options.rle.?.raster.commands.max_commands = 1;
    try t.expectError(error.LimitExceeded, pixels.decode(t.allocator, raw, options));
}

test "BMP RLE RGBA retains padding trailing and malformed stream errors" {
    const commands = [_]u8{ 0, 3, 0, 0, 0, 123, 0, 1, 99 };
    const raw = try @import("rle_fixture.zig").bitmap(t.allocator, &commands, 8, 3, 1);
    defer t.allocator.free(raw);
    var options = f.options;
    try t.expectError(error.InvalidBmpRlePadding, pixels.decode(t.allocator, raw, options));
    options.rle.?.raster.commands.padding = .preserve;
    try t.expectError(error.TrailingBmpRleBytes, pixels.decode(t.allocator, raw, options));
    options.rle.?.raster.allow_trailing_bytes = true;
    var image = try pixels.decode(t.allocator, raw, options);
    defer image.deinit(t.allocator);
    try t.expectEqual(@as(usize, 1), image.rle.?.trailing_bytes);
    try t.expectEqual(@as(usize, 8), image.rle.?.consumed_bytes);
    const bad = try f.bitmap(t.allocator, 8, false);
    defer t.allocator.free(bad);
    bad[bad.len - 4] = 3;
    try t.expectError(error.InvalidBmpRlePosition, pixels.decode(t.allocator, bad, f.options));
}

test "BMP RLE RGBA opt-in does not change ordinary BMP or accept other compression" {
    var ordinary = try pixels.decode(t.allocator, &@import("test_fixture.zig").plain, f.options);
    defer ordinary.deinit(t.allocator);
    try t.expectEqualSlices(u8, &@import("test_fixture.zig").rgba, ordinary.rgba);
    try t.expect(ordinary.rle == null);
    const raw = try f.bitmap(t.allocator, 8, false);
    defer t.allocator.free(raw);
    var disabled = f.options;
    disabled.rle = null;
    try t.expectError(error.UnsupportedBmpPixelCompression, pixels.decode(t.allocator, raw, disabled));
    const put = @import("test_fixture.zig").put;
    put(raw, 28, u16, 0);
    put(raw, 30, u32, 4);
    try t.expectError(error.UnsupportedBmpPixelCompression, pixels.decode(t.allocator, raw, f.options));
}

fn rejected(a: std.mem.Allocator) !void {
    const raw = try f.bitmap(a, 8, false);
    defer a.free(raw);
    var options = f.options;
    options.rle.?.unwritten = .reject;
    var image = pixels.decode(a, raw, options) catch |err| switch (err) {
        error.UnwrittenBmpRlePixels => return,
        else => return err,
    };
    defer image.deinit(a);
    return error.UnexpectedFilledSuccess;
}
test "BMP RLE RGBA accounts both owned allocations on success and failure" {
    try t.checkAllAllocationFailures(t.allocator, rejected, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try owned(checked.allocator(), 8);
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try rejected(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
