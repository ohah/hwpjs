const std = @import("std");
const t = std.testing;
const adobe = @import("adobe.zig");
const inspection = @import("adobe_inspection.zig");
const basic = "Adobe".* ++ .{ 0, 100, 0x40, 0, 0, 0, 1 };

test "JPEG Adobe preserves every word and transform byte without fallback" {
    var bytes = basic;
    for (0..65536) |n| {
        std.mem.writeInt(u16, bytes[5..7], @intCast(n), .big);
        std.mem.writeInt(u16, bytes[7..9], @intCast(n ^ 0xa55a), .big);
        std.mem.writeInt(u16, bytes[9..11], @intCast(65535 - n), .big);
        const h = try adobe.Header.parse(&bytes);
        try t.expectEqual(n, h.version);
        try t.expectEqual(n ^ 0xa55a, h.flags0);
        try t.expectEqual(65535 - n, h.flags1);
        try t.expectEqual(n < 256, h.hasPrintIdentifier());
    }
    bytes = basic;
    for (0..256) |n| {
        bytes[11] = @intCast(n);
        const h = try adobe.Header.parse(&bytes);
        try t.expectEqual(n, @intFromEnum(h.transform));
        for ([_]u8{ 3, 4 }) |count| {
            if (n > 2) try t.expectError(error.UnsupportedAdobeTransform, h.printEncoding(count)) else if ((n == 1 and count == 4) or (n == 2 and count == 3)) try t.expectError(error.InvalidAdobeTransformComponents, h.printEncoding(count)) else try t.expectEqual(if (n == 0) (if (count == 3) adobe.Encoding.rgb else .complemented_cmyk) else (if (n == 1) adobe.Encoding.ycbcr else .ycck), try h.printEncoding(count));
        }
    }
}

test "JPEG Adobe payload boundaries preserve extension bytes and identifier scope" {
    for (0..12) |n| try t.expectError(error.UnexpectedEnd, adobe.Header.parse(basic[0..n]));
    var wrong = basic;
    for (0..5) |i| {
        wrong[i] ^= 1;
        try t.expectError(error.InvalidAdobeIdentifier, adobe.Header.parse(&wrong));
        wrong[i] ^= 1;
    }
    var extended: [65534]u8 = @splat(0xa5);
    @memcpy(extended[0..12], &basic);
    const h = try adobe.Header.parse(extended[0..65533]);
    try t.expectEqual(@as(usize, 65521), h.extra.len);
    try t.expectEqual(@intFromPtr(extended[12..].ptr), @intFromPtr(h.extra.ptr));
    try t.expectError(error.LimitExceeded, adobe.Header.parse(&extended));
    wrong[5] = 1;
    const conventional = try adobe.Header.parse(&wrong);
    try t.expectError(error.InvalidPrintAdobeIdentifier, conventional.printEncoding(3));
    for (0..256) |count| if (count != 3 and count != 4) try t.expectError(error.UnsupportedAdobeComponentCount, h.printEncoding(@intCast(count)));
}

const soi = [_]u8{ 255, 216 };
const rest = [_]u8{ 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 127 };
const eoi = [_]u8{ 255, 217 };
const app = [_]u8{ 255, 238, 0, 15 } ++ basic ++ .{0x91};
const raw = soi ++ app ++ rest ++ app ++ eoi;

fn successful(a: std.mem.Allocator) !void {
    var result = try inspection.inspect(a, &raw, .{});
    defer result.deinit(a);
    try t.expectEqual(@as(usize, 2), result.headers.len);
    try t.expectEqualSlices(u8, &.{0x91}, result.headers[1].extra);
    try t.expectEqual(@intFromPtr(raw[2 + app.len + rest.len + 16 ..].ptr), @intFromPtr(result.headers[1].extra.ptr));
}

test "JPEG Adobe full scan preserves duplicates and cleans allocation failures" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
    try t.expectError(error.LimitExceeded, inspection.inspect(t.allocator, &raw, .{ .max_adobe_markers = 1 }));
    for (0..raw.len) |n| {
        if (inspection.inspect(t.allocator, raw[0..n], .{})) |value| {
            var unexpected = value;
            unexpected.deinit(t.allocator);
            return error.UnexpectedValidTruncation;
        } else |_| {}
    }
    var unrelated = app;
    unrelated[4] = 'X';
    var result = try inspection.inspect(t.allocator, &(soi ++ unrelated ++ rest ++ eoi), .{ .max_adobe_markers = 0 });
    defer result.deinit(t.allocator);
    try t.expectEqual(@as(usize, 0), result.headers.len);
}

test "JPEG Adobe distinct headers keep physical order across entropy" {
    var distinct = app;
    distinct[9] = 1; // version high byte: conventional match, not T.872 identifier.
    distinct[15] = 255; // unknown transform remains unknown.
    distinct[16] = 0x27;
    const bytes = soi ++ app ++ rest ++ distinct ++ eoi;
    var result = try inspection.inspect(t.allocator, &bytes, .{});
    defer result.deinit(t.allocator);
    try t.expectEqual(@as(usize, 2), result.headers.len);
    try t.expectEqual(@as(u16, 100), result.headers[0].version);
    try t.expectEqual(@as(u16, 356), result.headers[1].version);
    try t.expectEqual(adobe.Transform.ycbcr, result.headers[0].transform);
    try t.expectEqual(@as(u8, 255), @intFromEnum(result.headers[1].transform));
    try t.expectEqualSlices(u8, &.{0x91}, result.headers[0].extra);
    try t.expectEqualSlices(u8, &.{0x27}, result.headers[1].extra);
}
