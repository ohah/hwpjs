const std = @import("std");
const t = std.testing;
const Axis = @import("sample_axis.zig").Axis;
const interpolation = @import("sample_interpolation.zig");

test "JPEG sample axis rejects invalid dimensions and hostile coordinates" {
    for ([_][2]u16{ .{ 0, 0 }, .{ 0, 1 }, .{ 1, 0 }, .{ 1, 2 } }) |pair| try t.expectError(error.InvalidJpegSampleAxis, Axis.fromDimensions(pair[0], pair[1]));
    for (1..65536) |n| {
        const axis = try Axis.fromDimensions(@intCast(n), @intCast(n));
        for ([_]u32{ 0, @intCast(n / 2), @intCast(n - 1) }) |at| {
            const w = axis.at(at).?;
            try t.expectEqual(at, w.lower);
            try t.expectEqual(@as(u32, 0), w.upper_weight);
            try t.expectEqual(at, w.nearest());
        }
        try t.expect(axis.at(@intCast(n)) == null);
        try t.expect(axis.at(std.math.maxInt(u32)) == null);
        const single = try Axis.fromDimensions(@intCast(n), 1);
        try t.expectEqual(@as(u16, 0), single.at(@intCast(n - 1)).?.upper);
    }
}

test "JPEG sample axis dimensions follow centered rational positions" {
    for (1..129) |reference| for (1..reference + 1) |source| {
        const axis = try Axis.fromDimensions(@intCast(reference), @intCast(source));
        for (0..reference) |coordinate| {
            const w = axis.at(@intCast(coordinate)).?;
            const ref: f64 = @floatFromInt(reference);
            const src: f64 = @floatFromInt(source);
            const x: f64 = @floatFromInt(coordinate);
            const position = @min(src - 1, @max(0, (x + 0.5) * src / ref - 0.5));
            const actual = @as(f64, @floatFromInt(w.lower)) + @as(f64, @floatFromInt(w.upper_weight)) / @as(f64, @floatFromInt(w.denominator));
            try t.expectApproxEqAbs(position, actual, 1e-12);
            try t.expect(w.upper < source and w.upper_weight < w.denominator);
        }
    };
    // 5/3 actual dimensions differ from a declared 2:1 factor. At x=1 the
    // former gives 2/5, not 1/4; do not silently treat these as interchangeable.
    const odd = (try Axis.fromDimensions(5, 3)).at(1).?;
    try t.expectEqual(@as(u32, 4), odd.upper_weight);
    try t.expectEqual(@as(u32, 10), odd.denominator);
}

test "JPEG bilinear samples round once and handle maximal denominators" {
    const half = (try Axis.fromDimensions(3, 2)).at(1).?;
    try t.expectEqual(@as(u16, 1), half.nearest());
    // Horizontal-first integer rounding would produce 1 instead of 0.
    try t.expectEqual(@as(u16, 0), interpolation.bilinear(0, 0, 0, 1, half, half));
    try t.expectEqual(@as(u16, 1), interpolation.bilinear(0, 1, 0, 1, half, half));
    const wide = (try Axis.fromDimensions(65535, 65534)).at(32767).?;
    for (0..65536) |n| try t.expectEqual(@as(u16, @intCast(n)), interpolation.bilinear(@intCast(n), @intCast(n), @intCast(n), @intCast(n), wide, wide));
    try t.expectEqual(@as(u16, 32768), interpolation.bilinear(0, 65535, 65535, 0, wide, wide));
}
