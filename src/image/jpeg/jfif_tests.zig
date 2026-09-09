const std = @import("std");
const t = std.testing;
const jfif = @import("jfif.zig");
const frame_parser = @import("frame.zig");
const header = [_]u8{ 'J', 'F', 'I', 'F', 0, 1, 2, 0, 0, 1, 0, 1, 0, 0 };

test "JPEG JFIF preserves all minor versions and rejects other major versions" {
    var bytes = header;
    for (0..65536) |version| {
        std.mem.writeInt(u16, bytes[5..7], @intCast(version), .big);
        if (version / 256 == 1) {
            const result = try jfif.Header.parse(&bytes);
            try t.expectEqual(@as(u16, @intCast(version)), result.version);
        } else try t.expectError(error.UnsupportedJfifVersion, jfif.Header.parse(&bytes));
    }
}

test "JPEG JFIF densities are nonzero big endian and units are not normalized" {
    var bytes = header;
    for (0..256) |unit| {
        bytes[7] = @intCast(unit);
        if (unit <= 2) try t.expectEqual(unit, @intFromEnum((try jfif.Header.parse(&bytes)).units)) else try t.expectError(error.InvalidJfifUnits, jfif.Header.parse(&bytes));
    }
    bytes[7] = 0;
    for (0..65536) |density| {
        std.mem.writeInt(u16, bytes[8..10], @intCast(density), .big);
        std.mem.writeInt(u16, bytes[10..12], @intCast(65535 - density), .big);
        if (density == 0 or density == 65535) {
            try t.expectError(error.InvalidJfifDensity, jfif.Header.parse(&bytes));
        } else {
            const parsed = try jfif.Header.parse(&bytes);
            try t.expectEqual(density, parsed.horizontal_density);
            try t.expectEqual(65535 - density, parsed.vertical_density);
        }
    }
}

test "JPEG JFIF all thumbnail dimensions respect segment budget and borrowed RGB" {
    var bytes: [14 + 255 * 255 * 3]u8 = undefined;
    @memcpy(bytes[0..14], &header);
    for (bytes[14..], 0..) |*value, i| value.* = @truncate(i);
    for (0..256) |width| for (0..256) |height| {
        bytes[12] = @intCast(width);
        bytes[13] = @intCast(height);
        const length = 14 + width * height * 3;
        if (length > 65533) {
            try t.expectError(error.LimitExceeded, jfif.Header.parse(bytes[0..length]));
        } else {
            const result = try jfif.Header.parse(bytes[0..length]);
            try t.expectEqual(width, result.thumbnail_width);
            try t.expectEqual(height, result.thumbnail_height);
            try t.expectEqual(width * height * 3, result.thumbnail_rgb.len);
            try t.expectEqual(@intFromPtr(bytes[14..].ptr), @intFromPtr(result.thumbnail_rgb.ptr));
            if (result.thumbnail_rgb.len != 0) try t.expectEqual(bytes[length - 1], result.thumbnail_rgb[result.thumbnail_rgb.len - 1]);
        }
    };
}

test "JPEG JFIF rejects truncated fields wrong signature and trailing thumbnail bytes" {
    for (0..header.len) |length| try t.expectError(error.UnexpectedEnd, jfif.Header.parse(header[0..length]));
    for (0..5) |at| {
        var bytes = header;
        bytes[at] ^= 1;
        try t.expectError(error.InvalidJfifIdentifier, jfif.Header.parse(&bytes));
    }
    try t.expectError(error.TrailingJfifBytes, jfif.Header.parse(&(header ++ .{0})));
    var bytes = header;
    bytes[12] = 1;
    bytes[13] = 1;
    for (0..3) |length| {
        const full = bytes ++ .{ 11, 22, 33 };
        try t.expectError(error.UnexpectedEnd, jfif.Header.parse(full[0 .. 14 + length]));
    }
}

test "JPEG JFIF frame constraints do not infer colour from arbitrary component IDs" {
    var raw = [_]u8{ 8, 0, 1, 0, 1, 3, 1, 34, 0, 2, 17, 0, 3, 17, 0 };
    try jfif.validateFrame(try frame_parser.parse(0xc0, &raw, .{}));
    for (0..3) |at| {
        raw[6 + at * 3] = 9;
        try t.expectError(error.InvalidJfifComponentId, jfif.validateFrame(try frame_parser.parse(0xc0, &raw, .{})));
        raw[6 + at * 3] = @intCast(at + 1);
    }
    raw[0] = 12;
    try t.expectError(error.InvalidJfifPrecision, jfif.validateFrame(try frame_parser.parse(0xc1, &raw, .{})));
    raw[0] = 8;
    raw[5] = 2;
    try t.expectError(error.InvalidJfifComponentCount, jfif.validateFrame(try frame_parser.parse(0xc0, raw[0..12], .{})));
    raw[5] = 1;
    try jfif.validateFrame(try frame_parser.parse(0xc0, raw[0..9], .{}));
}
