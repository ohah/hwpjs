const std = @import("std");
const rgba = @import("rgba.zig");
const fixture = @import("pixels_fixture.zig");
const generated = @import("rgba_fixture.zig");
const pixels = @import("pixels.zig");
const raster = @import("rgba_raster.zig");

test "PNG RGBA indexed palette and transparency are copied into owned pixels" {
    const a = std.testing.allocator;
    const encoded = try fixture.withTransparency(a, 0, &.{128});
    defer a.free(encoded);
    var image = try rgba.decode(a, encoded, .{});
    defer image.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 7, 8, 9, 128 }, image.raster.rgba);
    try std.testing.expectError(error.LimitExceeded, rgba.decode(a, encoded, .{ .max_rgba_bytes = 3 }));
}

test "PNG RGBA scales packed grayscale before output but compares tRNS in native depth" {
    const a = std.testing.allocator;
    const encoded = try generated.image(a, 4, 1, 2, 0, 0, &.{ 0, 0x1b }, null, &.{ 0, 2 });
    defer a.free(encoded);
    var image = try rgba.decode(a, encoded, .{});
    defer image.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 0, 0, 0, 255, 85, 85, 85, 255, 170, 170, 170, 0, 255, 255, 255, 255 }, image.raster.rgba);
}

test "PNG RGBA compares full 16-bit tRNS before eight-bit conversion" {
    const a = std.testing.allocator;
    const encoded = try generated.image(a, 2, 1, 16, 0, 0, &.{ 0, 0x12, 0x34, 0x12, 0x35 }, null, &.{ 0x12, 0x34 });
    defer a.free(encoded);
    var image = try rgba.decode(a, encoded, .{});
    defer image.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 18, 18, 18, 0, 18, 18, 18, 255 }, image.raster.rgba);
}

test "PNG RGBA expands every packed palette depth without using padding bits" {
    const a = std.testing.allocator;
    const palette = [_]u8{ 1, 2, 3, 4, 5, 6 };
    for ([_]struct { depth: u8, rows: []const u8 }{
        .{ .depth = 1, .rows = &.{ 0, 0x40 } },
        .{ .depth = 2, .rows = &.{ 0, 0x10 } },
        .{ .depth = 4, .rows = &.{ 0, 0x01 } },
        .{ .depth = 8, .rows = &.{ 0, 0, 1 } },
    }) |case| {
        const encoded = try generated.image(a, 2, 1, case.depth, 3, 0, case.rows, &palette, &.{ 0, 128 });
        defer a.free(encoded);
        var image = try rgba.decode(a, encoded, .{});
        defer image.deinit(a);
        try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 0, 4, 5, 6, 128 }, image.raster.rgba);
    }
}

test "PNG RGBA expands one and four-bit grayscale endpoints" {
    const a = std.testing.allocator;
    for ([_]struct { depth: u8, rows: []const u8 }{
        .{ .depth = 1, .rows = &.{ 0, 0x40 } },
        .{ .depth = 4, .rows = &.{ 0, 0x0f } },
    }) |case| {
        const encoded = try generated.image(a, 2, 1, case.depth, 0, 0, case.rows, null, null);
        defer a.free(encoded);
        var image = try rgba.decode(a, encoded, .{});
        defer image.deinit(a);
        try std.testing.expectEqualSlices(u8, &.{ 0, 0, 0, 255, 255, 255, 255, 255 }, image.raster.rgba);
    }
}

test "PNG RGBA handles truecolor transparency and explicit alpha colour types" {
    const a = std.testing.allocator;
    const rgb = try generated.image(a, 2, 1, 8, 2, 0, &.{ 0, 10, 20, 30, 10, 20, 31 }, null, &.{ 0, 10, 0, 20, 0, 30 });
    defer a.free(rgb);
    var first = try rgba.decode(a, rgb, .{});
    defer first.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 10, 20, 30, 0, 10, 20, 31, 255 }, first.raster.rgba);
    const gray_alpha = try generated.image(a, 1, 1, 16, 4, 0, &.{ 0, 0x80, 0, 0x40, 0 }, null, null);
    defer a.free(gray_alpha);
    var second = try rgba.decode(a, gray_alpha, .{});
    defer second.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 128, 128, 128, 64 }, second.raster.rgba);
    const rgba8 = try generated.image(a, 1, 1, 8, 6, 0, &.{ 0, 10, 20, 30, 40 }, null, null);
    defer a.free(rgba8);
    var third = try rgba.decode(a, rgba8, .{});
    defer third.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 10, 20, 30, 40 }, third.raster.rgba);
    const rgb16 = try generated.image(a, 1, 1, 16, 2, 0, &.{ 0, 0x80, 0, 0, 0, 0xff, 0xff }, null, &.{ 0x80, 0, 0, 0, 0xff, 0xff });
    defer a.free(rgb16);
    var fourth = try rgba.decode(a, rgb16, .{});
    defer fourth.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 128, 0, 255, 0 }, fourth.raster.rgba);
    const rgba16 = try generated.image(a, 1, 1, 16, 6, 0, &.{ 0, 0x80, 0, 0, 0, 0xff, 0xff, 0x40, 0 }, null, null);
    defer a.free(rgba16);
    var fifth = try rgba.decode(a, rgba16, .{});
    defer fifth.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 128, 0, 255, 64 }, fifth.raster.rgba);
}

test "PNG RGBA Adam7 distributes every pixel to its final row and owns the output" {
    const a = std.testing.allocator;
    const tile = [_][8]u8{ .{ 1, 6, 4, 6, 2, 6, 4, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 }, .{ 5, 6, 5, 6, 5, 6, 5, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 }, .{ 3, 6, 4, 6, 3, 6, 4, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 }, .{ 5, 6, 5, 6, 5, 6, 5, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 } };
    var rows: std.ArrayList(u8) = .empty;
    defer rows.deinit(a);
    for (1..8) |pass| for (0..8) |y| {
        var present = false;
        for (0..8) |x| {
            if (tile[y][x] == pass) present = true;
        }
        if (!present) continue;
        try rows.append(a, 0);
        for (0..8) |x| {
            if (tile[y][x] == pass) try rows.append(a, @intCast(y * 8 + x));
        }
    };
    const encoded = try generated.image(a, 8, 8, 8, 0, 1, rows.items, null, null);
    defer a.free(encoded);
    var image = try rgba.decode(a, encoded, .{});
    defer image.deinit(a);
    for (0..64) |index| try std.testing.expectEqual([4]u8{ @intCast(index), @intCast(index), @intCast(index), 255 }, image.raster.rgba[index * 4 ..][0..4].*);
}

test "PNG RGBA rejects output limit and releases all allocation failures" {
    const a = std.testing.allocator;
    const encoded = try generated.image(a, 1, 1, 8, 6, 0, &.{ 0, 1, 2, 3, 4 }, null, null);
    defer a.free(encoded);
    try std.testing.expectError(error.LimitExceeded, rgba.decode(a, encoded, .{ .max_rgba_bytes = 3 }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, png: []const u8) !void {
            var image = try rgba.decode(allocator, png, .{});
            image.deinit(allocator);
        }
    }.run, .{encoded});
}

test "PNG RGBA direct raster rejects forged layout before indexing" {
    const a = std.testing.allocator;
    const encoded = try generated.image(a, 1, 1, 8, 6, 0, &.{ 0, 1, 2, 3, 4 }, null, null);
    defer a.free(encoded);
    var decoded = try pixels.decode(a, encoded, .{});
    defer decoded.deinit(a);
    decoded.layout.passes[0].offset = decoded.bytes.len;
    try std.testing.expectError(error.InvalidPngScanlineSize, raster.fromDecoded(a, &decoded, 4));
    decoded.layout.passes[0].offset = 0;
    decoded.bytes = decoded.bytes[0 .. decoded.bytes.len - 1];
    // Keep the owned allocation intact: only the view is forged here.
    const truncated = decoded.bytes;
    try std.testing.expectError(error.LimitExceeded, raster.fromDecoded(a, &decoded, 4));
    decoded.bytes = truncated.ptr[0 .. truncated.len + 1];
}
