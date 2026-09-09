const std = @import("std");
const t = std.testing;
const jpeg = @import("jfif_rgb.zig");
const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
const h = [_]u8{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const sof = [_]u8{ 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0 };
const scan = [_]u8{ 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0x5f };
const jfif = [_]u8{ 255, 224, 0, 16 } ++ "JFIF\x00".* ++ .{ 1, 2, 0, 0, 1, 0, 1, 0, 0 };
const adobe = [_]u8{ 255, 238, 0, 14 } ++ "Adobe".* ++ .{ 0, 100, 0, 0, 0, 0, 0 };
const profile = [_]u8{ 255, 226, 0, 19 } ++ "ICC_PROFILE\x00".* ++ .{ 1, 1, 9, 2, 7 };
const raw = [_]u8{ 255, 216 } ++ jfif ++ q ++ h ++ sof ++ scan ++ adobe ++ profile ++ .{ 255, 217 };
const options: jpeg.Options = .{ .upsampling = .nearest, .colour_management = .unmanaged };

fn successful(a: std.mem.Allocator) !void {
    var bytes = raw;
    var result = try jpeg.decode(a, &bytes, options);
    defer result.deinit(a);
    @memset(&bytes, 0);
    try t.expectEqualSlices(u8, &.{ 129, 129, 129 }, result.raster.rgb);
    try t.expect(result.metadata_deferred);
    try t.expectEqual(@as(usize, 1), result.adobe_headers);
    try t.expectEqual(@as(u8, 1), result.icc_chunks);
}

test "JPEG RGB JFIF whole decode owns output and retains metadata deferral" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
    var bounded = options;
    bounded.max_rgb_bytes = 2;
    try t.expectError(error.LimitExceeded, jpeg.decode(t.allocator, &raw, bounded));
    bounded = options;
    bounded.planes.max_samples = 0;
    try t.expectError(error.LimitExceeded, jpeg.decode(t.allocator, &raw, bounded));
    bounded = options;
    bounded.max_icc_bytes = 2;
    try t.expectError(error.LimitExceeded, jpeg.decode(t.allocator, &raw, bounded));
}

test "JPEG RGB JFIF rejects late colour conflicts truncation and bad entropy" {
    var bad = raw;
    const scan_at = 2 + jfif.len + q.len + h.len + sof.len;
    const adobe_at = scan_at + scan.len;
    bad[adobe_at + 15] = 1;
    try t.expectError(error.ConflictingJfifAdobeColour, jpeg.decode(t.allocator, &bad, options));
    bad = raw;
    bad[scan_at + scan.len - 1] = 0x40;
    try t.expectError(error.InvalidJpegEntropyPadding, jpeg.decode(t.allocator, &bad, options));
    for (0..raw.len) |n| {
        if (jpeg.decode(t.allocator, raw[0..n], options)) |value| {
            var unexpected = value;
            unexpected.deinit(t.allocator);
            return error.UnexpectedValidTruncation;
        } else |_| {}
    }
}
