const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const bmp = @import("bmp_images.zig");
const f = @import("../../image/bmp/test_fixture.zig");
const options: bmp.Options = .{ .colour_management = .unmanaged, .mask_scaling = .nearest_normalized };
const extension = &[_]u8{ 'b', 0, 'm', 0, 'p', 0 };

fn repeated(a: std.mem.Allocator) !void {
    var b: images.Budget = .{ .options = .{ .bmp = options, .max_total_bmp_rgba_bytes = 32, .max_total_pixel_bytes = 0, .max_total_jpeg_rgb_bytes = 0 } };
    try b.consume(a, &f.plain, extension);
    try b.consume(a, &f.plain, null);
    try t.expectEqual(@as(usize, 2), b.report.binaries);
    try t.expectEqualDeep(bmp.Report{ .images = 2, .rgba_bytes = 32, .metadata_deferred_images = 2 }, b.report.bmp);
    try t.expectEqual(@as(usize, 0), b.report.pixel_bytes);
    try t.expectEqual(@as(usize, 0), b.report.jpeg.rgb_bytes);
    try t.expectEqual(@as(usize, 0), b.report.unhandled_binaries);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(a, &f.plain, extension));
    try t.expectEqualDeep(before, b.report);
}
test "HWP BMP references use remaining independent RGBA budget atomically" {
    try repeated(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, repeated, .{});
}

test "HWP BMP selection keeps PNG JPEG precedence and extension evidence" {
    var b: images.Budget = .{ .options = .{} };
    try b.consume(t.allocator, "bad", extension);
    try b.consume(t.allocator, &f.plain, extension);
    try t.expectEqual(@as(usize, 2), b.report.unhandled_binaries);
    b.options.bmp = options;
    try b.consume(t.allocator, &f.plain, &.{ 'B', 0, 'm', 0, 'P', 0 });
    try b.consume(t.allocator, &f.plain, &.{ 'o', 0, 'l', 0, 'e', 0 });
    try b.consume(t.allocator, &f.plain, null);
    try b.consume(t.allocator, &f.plain, &.{});
    try t.expectEqual(@as(usize, 1), b.report.bmp.extension_disagreements);
    const before = b.report;
    try t.expectError(error.InvalidBmpSignature, b.consume(t.allocator, "bad", extension));
    try t.expectEqualDeep(before, b.report);
    const png = try @import("../../image/png/pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(png);
    try b.consume(t.allocator, png, extension);
    b.options.jpeg = .{ .completion = .require_full, .render = .{ .upsampling = .nearest, .colour_management = .unmanaged } };
    try b.consume(t.allocator, &@import("jpeg_image_fixture.zig").sequential, extension);
    try t.expectEqual(@as(usize, 1), b.report.png_images);
    try t.expectEqual(@as(usize, 1), b.report.jpeg.images);
    try t.expectEqual(@as(usize, 4), b.report.bmp.images);
    try t.expectEqual(@as(usize, 1), b.report.png_extension_disagreements);
    try t.expectEqual(@as(usize, 1), b.report.jpeg.extension_disagreements);
    const mixed = b.report;
    if (b.consume(t.allocator, &f.plain, &.{ 'p', 0, 'n', 0, 'g', 0 })) |_| return error.UnexpectedFallback else |_| {}
    if (b.consume(t.allocator, &f.plain, &.{ 'j', 0, 'p', 0, 'g', 0 })) |_| return error.UnexpectedFallback else |_| {}
    try t.expectEqualDeep(mixed, b.report);
    try b.consume(t.allocator, "OLE", &.{ 'o', 0, 'l', 0, 'e', 0 });
    try b.consume(t.allocator, "bad", &.{ 'b', 1, 'm', 0, 'p', 0 });
    try t.expectEqual(@as(usize, 4), b.report.unhandled_binaries);
}

test "HWP BMP truncated and compressed pixels never become empty success" {
    var b: images.Budget = .{ .options = .{ .bmp = options } };
    for (0..f.plain.len) |n| {
        if (b.consume(t.allocator, f.plain[0..n], extension)) |_| return error.UnexpectedValidTruncation else |_| {}
        try t.expectEqualDeep(images.Report{}, b.report);
    }
    var raw = f.indexed();
    f.put(&raw, 30, u32, 1);
    f.put(&raw, 34, u32, 4);
    try t.expectError(error.UnsupportedBmpPixelCompression, b.consume(t.allocator, &raw, extension));
    try t.expectEqualDeep(images.Report{}, b.report);
}

test "HWP BMP forwards each structure and output bound before allocation" {
    const raw = f.indexed();
    for (0..7) |which| {
        var b: images.Budget = .{ .options = .{ .bmp = options } };
        switch (which) {
            0 => b.options.bmp.?.structure.header.max_pixels = 0,
            1 => b.options.bmp.?.structure.max_bytes = raw.len - 1,
            2 => b.options.bmp.?.structure.max_palette_entries = 1,
            3 => b.options.bmp.?.structure.max_pixel_bytes = 3,
            4 => b.options.bmp.?.max_rgba_bytes = 3,
            5 => b.options.max_total_bmp_rgba_bytes = 3,
            6 => b.options.max_binaries = 0,
            else => unreachable,
        }
        var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
        try t.expectError(error.LimitExceeded, b.consume(failing.allocator(), &raw, extension));
        try t.expectEqualDeep(images.Report{}, b.report);
    }
}

test "HWP BMP preserves explicit trailing and metadata deferral policies" {
    const raw = try f.extended(t.allocator, 124);
    defer t.allocator.free(raw);
    f.put(raw, 70, u32, 0x4d424544); // PROFILE_EMBEDDED remains raw/deferred.
    f.put(raw, 126, u32, 0xffffffff);
    f.put(raw, 130, u32, 127);
    var b: images.Budget = .{ .options = .{ .bmp = options } };
    try b.consume(t.allocator, raw, extension);
    const tail = f.plain ++ .{7};
    const before = b.report;
    try t.expectError(error.TrailingBmpBytes, b.consume(t.allocator, &tail, extension));
    try t.expectEqualDeep(before, b.report);
    b.options.bmp.?.structure.allow_trailing_bytes = true;
    try b.consume(t.allocator, &tail, extension);
    try t.expectEqual(@as(usize, 2), b.report.bmp.metadata_deferred_images);
    try t.expect(b.report.semantics_deferred);
}

fn detached(a: std.mem.Allocator) !void {
    var report = blk: {
        const bytes = try @import("image_fixture.zig").withExtension(a, &f.plain, 2, "bmp");
        defer a.free(bytes);
        break :blk try @import("validation.zig").inspect(a, bytes, .{ .images = .{ .bmp = options, .max_total_bmp_rgba_bytes = 32 }, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } });
    };
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
    try t.expectEqualDeep(bmp.Report{ .images = 2, .rgba_bytes = 32, .metadata_deferred_images = 2 }, report.images.?.bmp);
    try t.expectEqual(@as(usize, 0), report.uninspected_streams);
}
test "HWP BMP container evidence outlives CFB and all image buffers" {
    try detached(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, detached, .{});
}

fn invalidIndex(a: std.mem.Allocator) !void {
    var raw = f.indexed();
    raw[62] = 2;
    var b: images.Budget = .{ .options = .{ .bmp = options } };
    try t.expectError(error.InvalidBmpPaletteIndex, b.consume(a, &raw, extension));
    try t.expectEqualDeep(images.Report{}, b.report);
}
test "HWP BMP allocator accounting includes successful and failed validation" {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try repeated(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try invalidIndex(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWP BMP counter overflow and lowered budget leave report untouched" {
    inline for (std.meta.fields(bmp.Report)) |field| {
        var prior: bmp.Report = .{};
        @field(prior, field.name) = std.math.maxInt(usize);
        var added: bmp.Report = .{};
        @field(added, field.name) = 1;
        try t.expectError(error.LimitExceeded, prior.plus(added));
    }
    var b: images.Budget = .{ .options = .{ .bmp = options } };
    b.report.bmp.images = std.math.maxInt(usize);
    const before = b.report;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, &f.plain, extension));
    try t.expectEqualDeep(before, b.report);
    b.report = .{};
    try b.consume(t.allocator, &f.plain, extension);
    b.options.max_total_bmp_rgba_bytes = 15;
    const consumed = b.report;
    try t.expectError(error.LimitExceeded, b.consume(t.allocator, &f.plain, extension));
    try t.expectEqualDeep(consumed, b.report);
}
