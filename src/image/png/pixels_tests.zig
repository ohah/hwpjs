const std = @import("std");
const t = std.testing;
const Layout = @import("layout.zig").Layout;
const Header = @import("header.zig").Header;
const pixels = @import("pixels.zig");
const indices = @import("palette_indices.zig");
const fixture = @import("pixels_fixture.zig");

test "PNG directly constructed invalid Header cannot validate a palette" {
    var invalid: Header = .{ .width = 1, .height = 1, .bit_depth = 0, .color_type = 3, .interlace = 0 };
    for ([_]u8{ 0, 3, 16, 255 }) |depth| {
        invalid.bit_depth = depth;
        try t.expectError(error.UnsupportedPngFormat, invalid.palette(&.{ 0, 0, 0 }));
    }
    invalid.bit_depth = 1;
    invalid.width = 0;
    try t.expectError(error.InvalidPngDimensions, invalid.palette(&.{ 0, 0, 0 }));
}

test "PNG Adam7 layout matches repeated specification tile and budgets" {
    const tile = [_][8]u8{ .{ 1, 6, 4, 6, 2, 6, 4, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 }, .{ 5, 6, 5, 6, 5, 6, 5, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 }, .{ 3, 6, 4, 6, 3, 6, 4, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 }, .{ 5, 6, 5, 6, 5, 6, 5, 6 }, .{ 7, 7, 7, 7, 7, 7, 7, 7 } };
    for (1..18) |width| for (1..18) |height| {
        const h: Header = .{ .width = @intCast(width), .height = @intCast(height), .bit_depth = 1, .color_type = 3, .interlace = 1 };
        const layout = try Layout.init(h, 10000);
        var total: usize = 0;
        for (layout.passes[0..layout.count], 1..) |pass, number| {
            var expected_pixels: usize = 0;
            var expected_rows: usize = 0;
            var expected_bytes: usize = 0;
            for (0..height) |y| {
                var row_pixels: usize = 0;
                for (0..width) |x| if (tile[y % 8][x % 8] == number) {
                    row_pixels += 1;
                };
                expected_pixels += row_pixels;
                if (row_pixels != 0) {
                    expected_rows += 1;
                    expected_bytes += 1 + (row_pixels + 7) / 8;
                }
            }
            try t.expectEqual(expected_pixels, @as(usize, pass.width) * pass.height);
            try t.expectEqual(expected_rows, if (pass.width == 0) 0 else pass.height);
            for (0..pass.height) |py| for (0..pass.width) |px| {
                const x = pass.x + pass.dx * px;
                const y = pass.y + pass.dy * py;
                try t.expect(x < width and y < height);
                try t.expectEqual(number, tile[y % 8][x % 8]);
            };
            total += expected_bytes;
        }
        try t.expectEqual(total, layout.bytes);
        _ = try Layout.init(h, total);
        try t.expectError(error.LimitExceeded, Layout.init(h, total - 1));
    };
    const huge: Header = .{ .width = 0x7fffffff, .height = 0x7fffffff, .bit_depth = 16, .color_type = 6, .interlace = 0 };
    try t.expectError(error.LimitExceeded, Layout.init(huge, std.math.maxInt(usize)));
    var invalid = huge;
    invalid.bit_depth = 3;
    try t.expectError(error.UnsupportedPngFormat, Layout.init(invalid, 100));
}

test "PNG palette indices ignore padding but validate every used packed sample" {
    for ([_]u8{ 1, 2, 4, 8 }) |depth| {
        const maximum: usize = @as(usize, 1) << @as(u4, @intCast(depth));
        for (0..256) |byte| {
            const row = [_]u8{@intCast(byte)};
            const sample = byte >> @as(u3, @intCast(8 - depth));
            if (sample == 0) try indices.inspect(&row, 1, depth, 1) else try t.expectError(error.InvalidPngPaletteIndex, indices.inspect(&row, 1, depth, 1));
            try indices.inspect(&row, 1, depth, maximum);
        }
    }
    try t.expectError(error.InvalidPngPaletteIndex, indices.inspect(&.{1}, 8, 1, 1));
    try t.expectError(error.InvalidPngScanlineSize, indices.inspect(&.{0}, 9, 1, 1));
    try t.expectError(error.InvalidPngPalette, indices.inspect(&.{0}, 1, 1, 0));
    try t.expectError(error.InvalidPngPalette, indices.inspect(&.{0}, 1, 1, 3));
}

fn allocation(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    var decoded = try pixels.decode(a, good, .{});
    defer decoded.deinit(a);
    try t.expectEqualSlices(u8, &.{ 0, 127 }, decoded.bytes);
    if (pixels.decode(a, bad, .{})) |result| {
        var unexpected = result;
        unexpected.deinit(a);
        return error.ExpectedPaletteFailure;
    } else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngPaletteIndex, err),
    }
}
test "PNG image split IDAT empty passes and allocation failure cleanup" {
    const good = try fixture.image(t.allocator, 127);
    defer t.allocator.free(good);
    const bad = try fixture.image(t.allocator, 128);
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, allocation, .{ good, bad });
    const report = try pixels.inspect(t.allocator, good, .{ .max_decoded_bytes = 2 });
    try t.expectEqual(@as(usize, 1), report.passes);
    try t.expectEqual(@as(usize, 1), report.scanlines);
    try t.expect(report.structure.pixels_validated);
    try t.expectError(error.LimitExceeded, pixels.inspect(t.allocator, good, .{ .max_decoded_bytes = 1 }));
}
