const std = @import("std");
const t = std.testing;
const idct = @import("idct.zig");
const Format = @import("sample_restoration.zig").Format;

fn reference(coefficients: [64]i64, x: usize, y: usize) f64 {
    @setFloatMode(.strict);
    var result: f64 = 0;
    for (0..8) |v| for (0..8) |u| {
        const cu: f64 = if (u == 0) 1 / @sqrt(@as(f64, 2)) else 1;
        const cv: f64 = if (v == 0) 1 / @sqrt(@as(f64, 2)) else 1;
        const ax = @as(f64, @floatFromInt((2 * x + 1) * u)) * std.math.pi / 16;
        const ay = @as(f64, @floatFromInt((2 * y + 1) * v)) * std.math.pi / 16;
        result += @as(f64, @floatFromInt(coefficients[v * 8 + u])) * cu * cv * @cos(ax) * @cos(ay) / 4;
    };
    return result;
}

test "JPEG IDCT DC-only blocks preserve exact eighths and half-sample boundaries" {
    var coefficients: [64]i64 = @splat(0);
    for (0..65536) |n| {
        coefficients[0] = @as(i64, @intCast(n)) - 32768;
        const result = idct.transform(coefficients);
        const expected = @as(f64, @floatFromInt(coefficients[0])) / 8;
        for (result) |value| try t.expectEqual(expected, value);
    }
    const format = try Format.init(8);
    coefficients[0] = -4;
    try t.expectEqual(@as(u16, 128), try format.sample(idct.transform(coefficients)[0]));
    coefficients[0] = 4;
    try t.expectEqual(@as(u16, 129), try format.sample(idct.transform(coefficients)[0]));
}

test "JPEG IDCT all frequency impulses match a direct two-dimensional formula" {
    for (0..64) |frequency| for ([_]i64{ -8, 8 }) |magnitude| {
        var coefficients: [64]i64 = @splat(0);
        coefficients[frequency] = magnitude;
        const result = idct.transform(coefficients);
        for (result, 0..) |value, i| try t.expectApproxEqAbs(reference(coefficients, i % 8, i / 8), value, 1e-12);
    };
}

test "JPEG IDCT mixed signed coefficients preserve orientation and stay finite" {
    var coefficients: [64]i64 = undefined;
    for ([_]i64{ 1, 1000000 }) |scale| {
        for (&coefficients, 0..) |*value, i| value.* = (@as(i64, @intCast((i * 37 + 11) % 257)) - 128) * scale;
        const result = idct.transform(coefficients);
        const tolerance: f64 = if (scale == 1) 1e-10 else 1e-4;
        for (result, 0..) |value, i| try t.expectApproxEqAbs(reference(coefficients, i % 8, i / 8), value, tolerance);
    }
    for ([_]i64{ std.math.minInt(i64), std.math.maxInt(i64) }) |value| {
        const result = idct.transform(@splat(value));
        for (result) |sample| try t.expect(std.math.isFinite(sample));
    }
}

test "JPEG sample restoration covers precision bytes integer levels and half ties" {
    for (0..256) |p| {
        if (p != 8 and p != 12) {
            try t.expectError(error.InvalidJpegPrecision, Format.init(@intCast(p)));
            continue;
        }
        const format = try Format.init(@intCast(p));
        for (0..@as(usize, format.maximum) + 1) |n| {
            const centered = @as(f64, @floatFromInt(n)) - @as(f64, @floatFromInt(format.level));
            try t.expectEqual(@as(u16, @intCast(n)), try format.sample(centered));
            try t.expectEqual(@as(u16, @intCast(@min(n + 1, format.maximum))), try format.sample(centered + 0.5));
            try t.expectEqual(@as(u16, @intCast(n)), try format.sample(centered + 0.5 - 1e-9));
        }
        try t.expectEqual(@as(u16, 0), try format.sample(-std.math.floatMax(f64)));
        try t.expectEqual(format.maximum, try format.sample(std.math.floatMax(f64)));
    }
}

test "JPEG sample restoration rejects nonfinite values at every block position" {
    const format = try Format.init(12);
    for ([_]f64{ std.math.nan(f64), std.math.inf(f64), -std.math.inf(f64) }) |invalid| {
        try t.expectError(error.InvalidJpegSample, format.sample(invalid));
        for (0..64) |at| {
            var values: [64]f64 = @splat(0);
            values[at] = invalid;
            try t.expectError(error.InvalidJpegSample, format.block(values));
        }
    }
    const result = try format.block(@splat(0));
    for (result) |value| try t.expectEqual(@as(u16, 2048), value);
}
