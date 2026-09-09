const std = @import("std");
const t = std.testing;
const Extension = @import("jfxx.zig").Extension;

test "JPEG JFXX code matrix preserves unknown and unchecked compressed bytes" {
    var bytes = [_]u8{ 'J', 'F', 'X', 'X', 0, 0, 7, 9, 11 };
    for (0..256) |code| {
        bytes[5] = @intCast(code);
        if (code == 17 or code == 19) {
            try t.expectError(error.UnexpectedEnd, Extension.parse(&bytes));
        } else {
            const value = try Extension.parse(&bytes);
            if (code == 16) {
                try t.expectEqualSlices(u8, bytes[6..], value.jpeg_unchecked);
            } else {
                try t.expectEqual(@as(u8, @intCast(code)), value.unknown.code);
                try t.expectEqualSlices(u8, bytes[6..], value.unknown.bytes);
            }
        }
    }
    bytes[5] = 16;
    try t.expectEqual(@as(usize, 0), (try Extension.parse(bytes[0..6])).jpeg_unchecked.len);
}

test "JPEG JFXX RGB and indexed thumbnails preserve every colour and bound access" {
    var bytes: [8 + 768 + 256]u8 = undefined;
    @memcpy(bytes[0..8], &[_]u8{ 'J', 'F', 'X', 'X', 0, 17, 16, 16 });
    for (0..256) |i| {
        bytes[8 + i * 3] = @intCast(i);
        bytes[9 + i * 3] = @intCast(255 - i);
        bytes[10 + i * 3] = @truncate(i * 37);
        bytes[776 + i] = @intCast(255 - i);
    }
    const indexed = (try Extension.parse(&bytes)).indexed;
    try t.expectEqual(@intFromPtr(bytes[8..].ptr), @intFromPtr(indexed.palette));
    for (0..256) |i| try t.expectEqualSlices(u8, bytes[8 + (255 - i) * 3 ..][0..3], &(indexed.pixel(i).?));
    try t.expect(indexed.pixel(256) == null);
    try t.expect(indexed.pixel(std.math.maxInt(usize)) == null);
    bytes[5] = 19;
    const rgb = (try Extension.parse(bytes[0..776])).rgb;
    for (0..256) |i| try t.expectEqualSlices(u8, bytes[8 + i * 3 ..][0..3], &(rgb.pixel(i).?));
    try t.expect(rgb.pixel(256) == null);
    try t.expect(rgb.pixel(std.math.maxInt(usize)) == null);
}

test "JPEG JFXX raw thumbnails reject zero dimensions truncation and trailing bytes" {
    var bytes: [8 + 768 + 3]u8 = @splat(0);
    @memcpy(bytes[0..8], &[_]u8{ 'J', 'F', 'X', 'X', 0, 17, 1, 1 });
    for ([_]u8{ 17, 19 }) |code| {
        bytes[5] = code;
        const length: usize = if (code == 17) 777 else 11;
        for (0..length) |n| try t.expectError(error.UnexpectedEnd, Extension.parse(bytes[0..n]));
        _ = try Extension.parse(bytes[0..length]);
        try t.expectError(error.TrailingJfxxBytes, Extension.parse(bytes[0 .. length + 1]));
        for (6..8) |at| {
            bytes[at] = 0;
            try t.expectError(error.InvalidJpegThumbnailDimensions, Extension.parse(bytes[0..length]));
            bytes[at] = 1;
        }
    }
    for (0..5) |at| {
        bytes[at] ^= 1;
        try t.expectError(error.InvalidJfxxIdentifier, Extension.parse(bytes[0..11]));
        bytes[at] ^= 1;
    }
    var huge: [65534]u8 = @splat(0);
    try t.expectError(error.LimitExceeded, Extension.parse(&huge));
}

test "JPEG JFXX all nonzero dimensions distinguish RGB and palette segment bounds" {
    var bytes: [8 + 768 + 255 * 255 * 3]u8 = @splat(0);
    @memcpy(bytes[0..6], "JFXX\x00\x11");
    for ([_]u8{ 17, 19 }) |code| {
        bytes[5] = code;
        for (1..256) |width| for (1..256) |height| {
            bytes[6] = @intCast(width);
            bytes[7] = @intCast(height);
            const length = 8 + (if (code == 17) 768 + width * height else width * height * 3);
            if (length > 65533) {
                try t.expectError(error.LimitExceeded, Extension.parse(bytes[0..length]));
            } else {
                const parsed = try Extension.parse(bytes[0..length]);
                const dimensions = if (code == 17) parsed.indexed.dimensions else parsed.rgb.dimensions;
                try t.expectEqual(width, dimensions.width);
                try t.expectEqual(height, dimensions.height);
                try t.expectEqual(width * height, dimensions.pixels());
                try t.expectEqual(width * height * (if (code == 17) @as(usize, 1) else 3), if (code == 17) parsed.indexed.indices.len else parsed.rgb.bytes.len);
            }
        };
    }
}
