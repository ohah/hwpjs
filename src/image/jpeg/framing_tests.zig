const std = @import("std");
const t = std.testing;
const markers = @import("markers.zig");
const entropy = @import("entropy.zig");
test "JPEG all marker codes classify independently of segment contents" {
    for (0..256) |n| {
        const bytes = [_]u8{ 0xff, @intCast(n), 0, 2 };
        var it = try markers.Iterator.init(&bytes, .{});
        if (n == 0 or n == 255) {
            try t.expectError(error.InvalidJpegMarker, it.next());
        } else if (n >= 2 and n <= 191) {
            try t.expectError(error.UnsupportedJpegReservedMarker, it.next());
        } else {
            const m = (try it.next()).?;
            const standalone = n == 1 or (n >= 208 and n <= 217);
            try t.expectEqual(if (standalone) @as(usize, 2) else 4, it.reader.offset);
            try t.expectEqual(@as(u8, @intCast(n)), m.code);
            try t.expectEqual(@as(usize, 0), m.payload.len);
            continue;
        }
        try t.expectEqual(@as(usize, 0), it.reader.offset);
        try t.expectEqual(@as(usize, 0), it.count);
    }
}
test "JPEG marker length includes itself and preserves cursor on every truncation" {
    const bytes = [_]u8{ 0xff, 0xff, 0xff, 0xe1, 0, 5, 7, 0xff, 0xd9 };
    for (1..bytes.len) |length| {
        var it = try markers.Iterator.init(bytes[0..length], .{});
        try t.expectError(error.UnexpectedEnd, it.next());
        try t.expectEqual(@as(usize, 0), it.reader.offset);
        try t.expectEqual(@as(usize, 0), it.count);
    }
    var it = try markers.Iterator.init(&bytes, .{ .max_markers = 1, .max_payload_bytes = 3 });
    const m = (try it.next()).?;
    try t.expectEqual(@as(usize, 2), m.fill_bytes);
    try t.expectEqualSlices(u8, &.{ 7, 0xff, 0xd9 }, m.payload);
    try t.expectEqualSlices(u8, &bytes, m.raw);
    try t.expectEqual(@as(?markers.Marker, null), try it.next());
    var limited = try markers.Iterator.init(&bytes, .{ .max_payload_bytes = 2 });
    try t.expectError(error.LimitExceeded, limited.next());
    for ([_]u8{ 0, 1 }) |len| {
        var invalid = try markers.Iterator.init(&.{ 0xff, 0xdb, 0, len }, .{});
        try t.expectError(error.InvalidJpegSegmentLength, invalid.next());
    }
}
test "JPEG entropy stuffing and fill leave restart markers unconsumed" {
    const bytes = [_]u8{ 7, 0xff, 0, 8, 0xff, 0xff, 0xd0, 0xff, 0xd9 };
    var it = try markers.Iterator.init(&bytes, .{});
    const e = try entropy.takeUntilMarker(&it.reader, 4);
    try t.expectEqualSlices(u8, bytes[0..4], e.raw);
    try t.expectEqual(@as(usize, 1), e.stuffed_bytes);
    try t.expectEqual(@as(usize, 3), e.coded_bytes);
    try t.expectEqual(@as(usize, 4), it.reader.offset);
    const restart = (try it.next()).?;
    try t.expectEqual(@as(u8, 0xd0), restart.code);
    try t.expectEqual(@as(usize, 1), restart.fill_bytes);
    const empty = try entropy.takeUntilMarker(&it.reader, 0);
    try t.expectEqual(@as(usize, 0), empty.raw.len);
    try t.expectEqual(@as(u8, 0xd9), (try it.next()).?.code);
    var r = (try markers.Iterator.init(&bytes, .{})).reader;
    try t.expectError(error.LimitExceeded, entropy.takeUntilMarker(&r, 3));
    try t.expectEqual(@as(usize, 0), r.offset);
}
test "JPEG malformed stuffing and missing marker preserve entropy cursor" {
    for ([_][]const u8{ &.{}, &.{1}, &.{0xff}, &.{ 0xff, 0 }, &.{ 0xff, 0xff } }) |bytes| {
        var r = (try markers.Iterator.init(bytes, .{})).reader;
        try t.expectError(error.UnexpectedEnd, entropy.takeUntilMarker(&r, 100));
        try t.expectEqual(@as(usize, 0), r.offset);
    }
    var bad = (try markers.Iterator.init(&.{ 0xff, 0xff, 0, 0xff, 0xd9 }, .{})).reader;
    try t.expectError(error.InvalidJpegStuffing, entropy.takeUntilMarker(&bad, 100));
    try t.expectEqual(@as(usize, 0), bad.offset);
}
test "JPEG every u16 segment length and largest payload honor exact bounds" {
    const bytes = try t.allocator.alloc(u8, 65537);
    defer t.allocator.free(bytes);
    @memset(bytes, 0xa5);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (0..65536) |n| {
        std.mem.writeInt(u16, bytes[2..4], @intCast(n), .big);
        var it = try markers.Iterator.init(bytes, .{});
        if (n < 2) {
            try t.expectError(error.InvalidJpegSegmentLength, it.next());
        } else {
            const m = (try it.next()).?;
            try t.expectEqual(n - 2, m.payload.len);
            try t.expectEqual(n + 2, it.reader.offset);
            try t.expect(m.payload.ptr == bytes.ptr + 4);
        }
    }
    try t.expectError(error.LimitExceeded, markers.Iterator.init(bytes, .{ .max_bytes = bytes.len - 1 }));
    var count = try markers.Iterator.init(&.{ 0xff, 0xd8, 0xff, 0xd9 }, .{ .max_markers = 1 });
    _ = try count.next();
    try t.expectError(error.LimitExceeded, count.next());
    try t.expectEqual(@as(usize, 2), count.reader.offset);
    try t.expectEqual(@as(usize, 1), count.count);
}
test "JPEG entropy byte matrix works at a nonzero input offset" {
    for (0..256) |n| {
        const bytes = [_]u8{ 99, @intCast(n), 0, 0xff, 0xd9 };
        var r = (try markers.Iterator.init(&bytes, .{})).reader;
        r.offset = 1;
        const e = try entropy.takeUntilMarker(&r, 2);
        try t.expectEqual(@as(usize, 3), r.offset);
        try t.expectEqual(@as(usize, if (n == 255) 1 else 0), e.stuffed_bytes);
        try t.expectEqual(@as(usize, if (n == 255) 1 else 2), e.coded_bytes);
        try t.expect(e.raw.ptr == bytes[1..].ptr);
    }
}
