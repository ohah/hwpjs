const std = @import("std");
const t = std.testing;
const amplitude = @import("amplitude.zig");
const Bits = @import("entropy_bits.zig").Bits;

test "JPEG EXTEND exhausts every magnitude value through sixteen bits" {
    for (0..17) |width| {
        const limit = @as(u32, 1) << @as(u5, @intCast(width));
        for (0..limit) |raw| {
            const value: u32 = @intCast(raw);
            const expected: i32 = if (width == 0) 0 else if (value & (limit / 2) != 0) @intCast(value) else -@as(i32, @intCast((limit - 1) ^ value));
            try t.expectEqual(expected, try amplitude.extend(value, @intCast(width)));
        }
        try t.expectError(error.InvalidJpegMagnitudeValue, amplitude.extend(limit, @intCast(width)));
        try t.expectError(error.InvalidJpegMagnitudeValue, amplitude.extend(std.math.maxInt(u32), @intCast(width)));
    }
    for (17..256) |width| try t.expectError(error.InvalidJpegMagnitudeWidth, amplitude.extend(0, @intCast(width)));
}

test "JPEG amplitude receive distinguishes category zero and preserves failures" {
    var empty = try Bits.init(&.{}, 0);
    try t.expectEqual(@as(i32, 0), try amplitude.receive(&empty, 0));
    try t.expectError(error.UnexpectedEnd, amplitude.receive(&empty, 1));
    var bits = try Bits.init(&.{ 0x12, 0x34 }, 2);
    try t.expectEqual(@as(i32, -60875), try amplitude.receive(&bits, 16));
    try bits.finish();
    var partial = try Bits.init(&.{0x42}, 1);
    _ = try partial.read(4);
    const before = partial;
    try t.expectError(error.UnexpectedEnd, amplitude.receive(&partial, 5));
    try t.expectEqualDeep(before, partial);
    try t.expectError(error.InvalidJpegMagnitudeWidth, amplitude.receive(&partial, 17));
    try t.expectEqualDeep(before, partial);
    try t.expectEqual(@as(i32, 0), try amplitude.receive(&partial, 0));
    try t.expectEqualDeep(before, partial);
    try t.expectEqual(@as(i32, -13), try amplitude.receive(&partial, 4));
    var marker = try Bits.init(&.{ 0x42, 255, 208 }, 3);
    _ = try marker.read(4);
    const marker_before = marker;
    try t.expectError(error.UnexpectedJpegEntropyMarker, amplitude.receive(&marker, 12));
    try t.expectEqualDeep(marker_before, marker);
    var stuffed = try Bits.init(&.{ 255, 0, 255, 0 }, 4);
    try t.expectEqual(@as(i32, 65535), try amplitude.receive(&stuffed, 16));
    try stuffed.finish();
}
