const std = @import("std");
const t = std.testing;
const colour = @import("jfif_colour.zig");

// Independently evaluate the uncombined decimal equations in T.871. The tiny
// allowance resolves binary-float drift exactly at a rational half tie; it is
// far smaller than the nearest non-tie distance in these bounded equations.
fn reference(value: f64) u8 {
    return @intFromFloat(@min(255, @max(0, @floor(value + 0.5 + 1e-9))));
}

test "JPEG JFIF colour neutral axis and saturated primaries" {
    for (0..256) |n| {
        const y: u8 = @intCast(n);
        try t.expectEqual([3]u8{ y, y, y }, colour.grayscale(y));
        try t.expectEqual(colour.grayscale(y), colour.toRgb(y, 128, 128));
        try t.expectEqual([3]u8{ y, 128, 128 }, colour.fromRgb(y, y, y));
    }
    try t.expectEqual([3]u8{ 76, 85, 255 }, colour.fromRgb(255, 0, 0));
    try t.expectEqual([3]u8{ 150, 44, 21 }, colour.fromRgb(0, 255, 0));
    try t.expectEqual([3]u8{ 29, 255, 107 }, colour.fromRgb(0, 0, 255));
    // R = 200 + 1.402 * -125 = 24.75; chroma extremes clamp, not wrap.
    try t.expectEqual(@as(u8, 25), colour.toRgb(200, 128, 3)[0]);
    try t.expectEqual(@as(u8, 255), colour.toRgb(255, 255, 255)[0]);
    // Exact positive half ties, including 127.5 in forward chroma.
    try t.expectEqual(@as(u8, 222), colour.toRgb(0, 253, 128)[2]);
    try t.expectEqual(@as(u8, 128), colour.fromRgb(0, 1, 1)[2]);
}

test "JPEG JFIF colour full chroma grid at boundary and middle luminance" {
    for ([_]u8{ 0, 1, 127, 128, 254, 255 }) |first| {
        const a: f64 = @floatFromInt(first);
        for (0..256) |second| for (0..256) |third| {
            const b: f64 = @floatFromInt(second);
            const c: f64 = @floatFromInt(third);
            const cb = b - 128;
            const cr = c - 128;
            const rgb: [3]u8 = .{ reference(a + 1.402 * cr), reference(a - (0.114 * 1.772 * cb + 0.299 * 1.402 * cr) / 0.587), reference(a + 1.772 * cb) };
            const ycc: [3]u8 = .{ reference(0.299 * a + 0.587 * b + 0.114 * c), reference((-0.299 * a - 0.587 * b + 0.886 * c) / 1.772 + 128), reference((0.701 * a - 0.587 * b - 0.114 * c) / 1.402 + 128) };
            try t.expectEqual(rgb, colour.toRgb(first, @intCast(second), @intCast(third)));
            try t.expectEqual(ycc, colour.fromRgb(first, @intCast(second), @intCast(third)));
        };
    }
}
