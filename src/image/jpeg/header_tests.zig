const std = @import("std");
const t = std.testing;
const frame = @import("frame.zig");
const scan = @import("scan.zig");
const codes = [_]u8{ 0xc0, 0xc1, 0xc2, 0xc3, 0xc9, 0xca, 0xcb };
const sample = [_]u8{ 8, 0, 1, 0, 2, 1, 9, 0x11, 0 };
test "JPEG frame precision matrix and marker family boundaries" {
    for (codes) |code| for (0..256) |precision| {
        var b = sample;
        b[0] = @intCast(precision);
        const valid = if (code == 0xc0) precision == 8 else if (code == 0xc3 or code == 0xcb) precision >= 2 and precision <= 16 else precision == 8 or precision == 12;
        if (valid) {
            const f = try frame.parse(code, &b, .{});
            try t.expectEqual(@as(u8, @intCast(precision)), f.precision);
            try t.expectEqual(@as(?u64, 2), f.pixels());
            try t.expect(f.components.raw.ptr == b[6..].ptr);
        } else try t.expectError(error.InvalidJpegPrecision, frame.parse(code, &b, .{}));
    };
    for (0..256) |n| {
        const code: u8 = @intCast(n);
        if (std.mem.indexOfScalar(u8, &codes, code) != null) continue;
        const differential = (code >= 0xc5 and code <= 0xc7) or (code >= 0xcd and code <= 0xcf);
        try t.expectError(if (differential) error.UnsupportedJpegHierarchicalFrame else error.InvalidJpegFrameMarker, frame.parse(code, &sample, .{}));
    }
}
test "JPEG frame counts cover 255 components without a scan count restriction" {
    var b = [_]u8{0} ** 771;
    b[0..6].* = .{ 8, 0, 1, 0, 1, 0 };
    for (0..255) |i| b[6 + i * 3 ..][0..3].* = .{ @intCast(i), 0x11, 0 };
    for (codes) |code| for (0..256) |count| {
        b[5] = @intCast(count);
        const payload = b[0 .. 6 + count * 3];
        if (count == 0 or ((code == 0xc2 or code == 0xca) and count > 4)) {
            try t.expectError(error.InvalidJpegComponentCount, frame.parse(code, payload, .{}));
        } else try t.expectEqual(count, (try frame.parse(code, payload, .{})).components.count());
    };
    b[5] = 2;
    b[9] = b[6];
    try t.expectError(error.DuplicateJpegComponent, frame.parse(0xc0, b[0..12], .{}));
    try t.expectError(error.LimitExceeded, frame.parse(0xc0, b[0..12], .{ .max_components = 1 }));
}
test "JPEG frame sampling selectors dimensions truncation and deferred height" {
    for (0..256) |value| {
        var b = sample;
        b[7] = @intCast(value);
        if (value >> 4 >= 1 and value >> 4 <= 4 and value & 15 >= 1 and value & 15 <= 4) {
            _ = try frame.parse(0xc0, &b, .{});
        } else try t.expectError(error.InvalidJpegSampling, frame.parse(0xc0, &b, .{}));
        b = sample;
        b[8] = @intCast(value);
        for (codes) |code| {
            const valid = if (code == 0xc3 or code == 0xcb) value == 0 else value <= 3;
            if (valid) _ = try frame.parse(code, &b, .{}) else try t.expectError(error.InvalidJpegQuantizationSelector, frame.parse(code, &b, .{}));
        }
    }
    for (0..sample.len) |n| try t.expectError(error.UnexpectedEnd, frame.parse(0xc0, sample[0..n], .{}));
    try t.expectError(error.InvalidJpegFrameLength, frame.parse(0xc0, &(sample ++ .{0}), .{}));
    try t.expectError(error.LimitExceeded, frame.parse(0xc0, &sample, .{ .max_pixels = 1 }));
    var b = sample;
    b[2] = 0;
    try t.expectEqual(@as(?u64, null), (try frame.parse(0xc0, &b, .{ .max_pixels = 0 })).pixels());
    b[4] = 0;
    try t.expectError(error.InvalidJpegDimensions, frame.parse(0xc0, &b, .{}));
}
test "JPEG scan entropy table selectors depend on the frame process" {
    for (codes) |code| for (0..256) |tables| {
        const f = try frame.parse(code, &sample, .{});
        const progressive = code == 0xc2 or code == 0xca;
        const lossless = code == 0xc3 or code == 0xcb;
        const b = [_]u8{ 1, 9, @intCast(tables), if (lossless) 1 else 0, if (progressive or lossless) 0 else 63, 0 };
        const maximum: usize = if (code == 0xc0) 1 else 3;
        const valid = tables >> 4 <= maximum and tables & 15 <= maximum and (!lossless or tables & 15 == 0);
        if (valid) _ = try scan.parse(&b, f) else try t.expectError(error.InvalidJpegEntropySelector, scan.parse(&b, f));
    };
}
test "JPEG progressive spectral and approximation matrices" {
    const f = try frame.parse(0xc2, &sample, .{});
    for (0..256) |ss| for (0..256) |se| {
        const b = [_]u8{ 1, 9, 0, @intCast(ss), @intCast(se), 0 };
        const valid = ss <= 63 and se <= 63 and se >= ss and (ss != 0 or se == 0);
        if (valid) _ = try scan.parse(&b, f) else try t.expectError(error.InvalidJpegScanParameters, scan.parse(&b, f));
    };
    for (0..256) |value| {
        const b = [_]u8{ 1, 9, 0, 0, 0, @intCast(value) };
        const high = value >> 4;
        const low = value & 15;
        const valid = high <= 13 and low <= 13 and (high == 0 or high == low + 1);
        if (valid) _ = try scan.parse(&b, f) else try t.expectError(error.InvalidJpegApproximation, scan.parse(&b, f));
    }
}
test "JPEG scan references use declaration order and interleaved sampling budget" {
    var b = [_]u8{ 8, 0, 1, 0, 1, 3, 9, 0x41, 0, 1, 0x22, 0, 7, 0x12, 0 };
    var f = try frame.parse(0xc0, &b, .{});
    const good = [_]u8{ 3, 9, 0, 1, 0, 7, 0, 0, 63, 0 };
    _ = try scan.parse(&good, f);
    try t.expectError(error.InvalidJpegComponentOrder, scan.parse(&.{ 2, 1, 0, 9, 0, 0, 63, 0 }, f));
    try t.expectError(error.InvalidJpegComponentOrder, scan.parse(&.{ 2, 9, 0, 9, 0, 0, 63, 0 }, f));
    try t.expectError(error.InvalidJpegComponentReference, scan.parse(&.{ 1, 8, 0, 0, 63, 0 }, f));
    b[13] = 0x13;
    try t.expectError(error.InvalidJpegMcuSampling, scan.parse(&good, f));
    b[7] = 0x44;
    _ = try scan.parse(&.{ 1, 9, 0, 0, 63, 0 }, f);
    f = try frame.parse(0xc2, &b, .{});
    try t.expectError(error.InvalidJpegScanParameters, scan.parse(&.{ 2, 9, 0, 1, 0, 1, 63, 0 }, f));
    for (0..6) |n| try t.expectError(error.UnexpectedEnd, scan.parse((&[_]u8{ 1, 9, 0, 0, 0, 0 })[0..n], f));
    try t.expectError(error.InvalidJpegScanLength, scan.parse(&.{ 1, 9, 0, 0, 0, 0, 0 }, f));
}
test "JPEG sequential and lossless scan parameter fields reject out of range values" {
    for ([_]u8{ 0xc0, 0xc1, 0xc3, 0xc9, 0xcb }) |code| {
        const f = try frame.parse(code, &sample, .{});
        const lossless = code == 0xc3 or code == 0xcb;
        for (3..6) |field| for (0..256) |value| {
            var b = [_]u8{ 1, 9, 0, if (lossless) 1 else 0, if (lossless) 0 else 63, 0 };
            b[field] = @intCast(value);
            const valid = if (lossless) switch (field) {
                3 => value >= 1 and value <= 7,
                4 => value == 0,
                else => value <= 15,
            } else value == (if (field == 4) @as(usize, 63) else 0);
            if (valid) _ = try scan.parse(&b, f) else try t.expectError(error.InvalidJpegScanParameters, scan.parse(&b, f));
        };
        for (0..256) |count| {
            if (count == 1) continue;
            try t.expectError(error.InvalidJpegComponentCount, scan.parse(&.{@intCast(count)}, f));
        }
    }
}
