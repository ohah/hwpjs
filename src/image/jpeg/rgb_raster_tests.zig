const std = @import("std");
const t = std.testing;
const raster = @import("rgb_raster.zig");
const planes = @import("sample_planes.zig");
const compatibility = @import("jfif_adobe.zig");
const adobe = @import("adobe.zig");

fn plane(samples: []u16, width: u32, height: u32) planes.Plane {
    return .{ .component = .{ .id = 9, .sampling = 17, .quantization = 0 }, .extent = .{ .width = width, .height = height }, .samples = samples };
}

fn successful(a: std.mem.Allocator) !void {
    var r = [_]u16{ 0, 1, 2, 3, 4, 5 };
    var g = [_]u16{ 10, 11, 12, 13, 14, 15 };
    var b = [_]u16{ 20, 21, 22, 23, 24, 25 };
    var input_planes = [_]planes.Plane{ plane(&r, 3, 2), plane(&g, 3, 2), plane(&b, 3, 2) };
    const input: planes.Image = .{ .width = 3, .height = 2, .precision = 8, .planes = &input_planes };
    for ([_]@import("upsampling.zig").Method{ .nearest, .bilinear }) |method| {
        var out = try raster.fromPlanes(a, input, .{ .encoding = .rgb, .upsampling = method, .max_rgb_bytes = 18 });
        defer out.deinit(a);
        try t.expectEqualSlices(u8, &.{ 0, 10, 20, 1, 11, 21, 2, 12, 22, 3, 13, 23, 4, 14, 24, 5, 15, 25 }, out.rgb);
    }
}

test "JPEG RGB raster interleaves rectangular planes and cleans allocation failures" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
}

test "JPEG RGB raster uses shared colour conversion and owns output" {
    var y = [_]u16{ 0, 255 };
    var cb = [_]u16{128};
    var cr = [_]u16{128};
    var pp = [_]planes.Plane{ plane(&y, 2, 1), plane(&cb, 1, 1), plane(&cr, 1, 1) };
    const input: planes.Image = .{ .width = 2, .height = 1, .precision = 8, .planes = &pp };
    var out = try raster.fromPlanes(t.allocator, input, .{ .encoding = .ycbcr, .upsampling = .bilinear });
    defer out.deinit(t.allocator);
    y[1] = 0;
    try t.expectEqualSlices(u8, &.{ 0, 0, 0, 255, 255, 255 }, out.rgb);
}

test "JPEG RGB raster rejects hostile dimensions precision counts lengths and samples" {
    var values = [_]u16{129};
    var pp = [_]planes.Plane{plane(&values, 1, 1)};
    var input: planes.Image = .{ .width = 1, .height = 1, .precision = 8, .planes = &pp };
    const options: raster.Options = .{ .encoding = .gray, .upsampling = .nearest };
    var out = try raster.fromPlanes(t.allocator, input, options);
    defer out.deinit(t.allocator);
    try t.expectEqualSlices(u8, &.{ 129, 129, 129 }, out.rgb);
    try t.expectError(error.LimitExceeded, raster.fromPlanes(t.allocator, input, .{ .encoding = .gray, .upsampling = .nearest, .max_rgb_bytes = 2 }));
    input.precision = 12;
    try t.expectError(error.UnsupportedJpegRgbPrecision, raster.fromPlanes(t.allocator, input, options));
    input.precision = 8;
    try t.expectError(error.InvalidJpegRgbComponentCount, raster.fromPlanes(t.allocator, input, .{ .encoding = .rgb, .upsampling = .nearest }));
    values[0] = 256;
    try t.expectError(error.InvalidJpegRgbSample, raster.fromPlanes(t.allocator, input, options));
    values[0] = 129;
    pp[0].extent.width = std.math.maxInt(u32);
    try t.expectError(error.InvalidJpegSampleAxis, raster.fromPlanes(t.allocator, input, options));
    pp[0].extent.width = 0;
    try t.expectError(error.InvalidJpegSampleAxis, raster.fromPlanes(t.allocator, input, options));
    pp[0].extent.width = 1;
    pp[0].samples = &.{};
    try t.expectError(error.InvalidJpegSamplePlaneLength, raster.fromPlanes(t.allocator, input, options));
    input.width = 0;
    try t.expectError(error.InvalidJpegRasterDimensions, raster.fromPlanes(t.allocator, input, options));
    try t.expectError(error.LimitExceeded, raster.requiredBytes(65535, 65535, std.math.maxInt(u32)));
}

test "JPEG RGB JFIF Adobe conflicts never select the last header or unknown fallback" {
    for (0..256) |transform| {
        const h: adobe.Header = .{ .version = 356, .flags0 = 65535, .flags1 = 65535, .transform = @enumFromInt(transform), .extra = &.{} };
        for ([_]usize{ 1, 3 }) |count| {
            if ((count == 1 and transform == 0) or (count == 3 and transform == 1)) try compatibility.validate(h, count) else try t.expectError(if (transform > 2) error.UnsupportedAdobeTransform else error.ConflictingJfifAdobeColour, compatibility.validate(h, count));
        }
    }
}
