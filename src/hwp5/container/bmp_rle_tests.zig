const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const fixture = @import("../../image/bmp/rle_rgba_fixture.zig");
const extension = &[_]u8{ 'b', 0, 'm', 0, 'p', 0 };

fn repeated(a: std.mem.Allocator) !void {
    const raw = try fixture.bitmap(a, 8, false);
    defer a.free(raw);
    var b: images.Budget = .{ .options = .{ .bmp = fixture.options, .max_total_bmp_rgba_bytes = 32, .max_total_pixel_bytes = 0, .max_total_jpeg_rgb_bytes = 0 } };
    try b.consume(a, raw, extension);
    b.options.bmp.?.rle.?.unwritten = .palette_zero;
    try b.consume(a, raw, extension);
    const report = b.report.bmp;
    try t.expectEqual(@as(usize, 2), report.images);
    try t.expectEqual(@as(usize, 32), report.rgba_bytes);
    try t.expectEqual(@as(usize, 2), report.rle_images);
    try t.expectEqual(@as(usize, 2), report.rle_written_pixels);
    try t.expectEqual(@as(usize, 6), report.rle_unwritten_pixels);
    try t.expectEqual(@as(usize, 4), report.rle_commands);
    try t.expectEqual(@as(usize, 8), report.rle_consumed_bytes);
    try t.expectEqual(@as(usize, 0), report.rle_trailing_bytes);
    try t.expectEqual(@as(usize, 3), report.rle_palette_zero_pixels);
    try t.expectEqual(@as(usize, 3), report.rle_transparent_pixels);
    try t.expectEqual(@as(usize, 2), report.metadata_deferred_images);
    try t.expectEqual(@as(usize, 0), b.report.unhandled_binaries);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(a, raw, extension));
    try t.expectEqualDeep(before, b.report);
}
test "BMP RLE HWP preserves mixed fill evidence and remaining RGBA budget" {
    try repeated(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, repeated, .{});
}

test "BMP RLE HWP forwards completion fill bounds and overflow atomically" {
    const raw = try fixture.bitmap(t.allocator, 8, false);
    defer t.allocator.free(raw);
    var b: images.Budget = .{ .options = .{ .bmp = fixture.options } };
    b.options.bmp.?.rle.?.raster.completion = .require_full;
    try t.expectError(error.IncompleteBmpRleRaster, b.consume(t.allocator, raw, extension));
    b.options.bmp.?.rle.?.raster.completion = .preserve_unwritten;
    b.options.bmp.?.rle.?.unwritten = .reject;
    try t.expectError(error.UnwrittenBmpRlePixels, b.consume(t.allocator, raw, extension));
    try t.expectEqualDeep(images.Report{}, b.report);
    b.options.bmp = fixture.options;
    b.options.max_total_bmp_rgba_bytes = 15;
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    try t.expectError(error.LimitExceeded, b.consume(failing.allocator(), raw, extension));
    try t.expectEqualDeep(images.Report{}, b.report);
    b.options.max_total_bmp_rgba_bytes = 32;
    b.options.bmp.?.rle.?.raster.max_index_bytes = 7;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, extension));
    b.options.bmp = fixture.options;
    b.report.bmp.rle_unwritten_pixels = std.math.maxInt(usize);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, raw, extension));
    try t.expectEqualDeep(before, b.report);
}

fn detached(a: std.mem.Allocator) !void {
    var report = blk: {
        const raw = try fixture.bitmap(a, 4, false);
        defer a.free(raw);
        const bytes = try @import("image_fixture.zig").withExtension(a, raw, 2, "bmp");
        defer a.free(bytes);
        break :blk try @import("validation.zig").inspect(a, bytes, .{ .images = .{ .bmp = fixture.options, .max_total_bmp_rgba_bytes = 32 }, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } });
    };
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
    try t.expectEqual(@as(usize, 2), report.images.?.bmp.rle_images);
    try t.expectEqual(@as(usize, 6), report.images.?.bmp.rle_transparent_pixels);
    try t.expectEqual(@as(usize, 0), report.uninspected_streams);
}
test "BMP RLE HWP scalar evidence outlives CFB index and RGBA buffers" {
    try detached(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, detached, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try detached(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
