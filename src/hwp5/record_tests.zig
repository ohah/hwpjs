const std = @import("std");
const h = @import("root.zig");

test "HWP5 records preserve framing and fail atomically at every truncation" {
    // External tag 1023, level 1023, extended size 3 (noncanonical but preserved).
    const bytes = [_]u8{ 255, 255, 255, 255, 3, 0, 0, 0, 1, 2, 3 };
    for (1..bytes.len) |n| {
        var it = h.record.Iterator.init(bytes[0..n], .{});
        try std.testing.expectError(error.UnexpectedEnd, it.next());
        try std.testing.expectEqual(@as(usize, 0), it.reader.offset);
        try std.testing.expectEqual(@as(usize, 0), it.count);
    }
    var it = h.record.Iterator.init(&bytes, .{ .max_payload_bytes = 3, .max_records = 1 });
    const record = (try it.next()).?;
    try std.testing.expectEqual(@as(u10, 1023), record.tag);
    try std.testing.expectEqual(@as(u10, 1023), record.level);
    try std.testing.expectEqualSlices(u8, &bytes, record.raw);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3 }, record.payload);
    try std.testing.expectEqual(@as(?h.record.Record, null), try it.next());
    it = h.record.Iterator.init(&bytes, .{ .max_payload_bytes = 2 });
    try std.testing.expectError(error.LimitExceeded, it.next());
    it = h.record.Iterator.init(&bytes, .{ .max_records = 0 });
    try std.testing.expectError(error.LimitExceeded, it.next());
    it = h.record.Iterator.init(&([_]u8{255} ** 8), .{ .max_payload_bytes = std.math.maxInt(usize) });
    try std.testing.expectError(error.UnexpectedEnd, it.next());
    it = h.record.Iterator.init(&([_]u8{0} ** 8), .{ .max_records = 1 });
    _ = try it.next();
    try std.testing.expectError(error.LimitExceeded, it.next());
    try std.testing.expectEqual(@as(usize, 4), it.reader.offset);
}
