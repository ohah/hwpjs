const std = @import("std");
const t = std.testing;
const h = @import("item.zig");
fn parse(tag: u8, bytes: []const u8) !h.value.Value {
    return h.value.parse(tag, bytes, .spec_flag_first);
}
test "history framing is five bytes and failed reads are atomic" {
    const raw = [_]u8{ 0xff, 2, 0, 0, 0, 4, 5 };
    var it = h.record.Iterator.init(&raw, .{});
    const r = (try it.next()).?;
    try t.expectEqual(255, r.tag);
    try t.expectEqualSlices(u8, raw[5..], r.payload);
    try t.expect(try it.next() == null);
    for (1..raw.len) |n| {
        var short = h.record.Iterator.init(raw[0..n], .{});
        for (0..2) |_| try t.expectError(error.UnexpectedEnd, short.next());
        try t.expectEqual(0, short.reader.offset);
        try t.expectEqual(0, short.count);
    }
    var limited = h.record.Iterator.init(&raw, .{ .max_payload_bytes = 1 });
    try t.expectError(error.LimitExceeded, limited.next());
    limited.options.max_payload_bytes = 2;
    _ = try limited.next();
}
test "history known payloads preserve flags, unsigned version and unknown data" {
    const start = try parse(0x10, &.{ 0x40, 0x80, 0xff, 0xff, 0xff, 0xff, 9 });
    try t.expectEqual(0x8040, start.start.flags);
    try t.expectEqual(0xffffffff, start.start.option);
    try t.expectEqualSlices(u8, &.{9}, start.start.extra);
    const v = try parse(0x20, &.{ 0xff, 0xff, 0xff, 0xff, 1 });
    try t.expectEqual(0xffffffff, v.version.number);
    try t.expectEqualSlices(u8, &.{1}, v.version.extra);
    try t.expectError(error.InvalidHistoryEndPayload, parse(0x11, &.{0}));
    for ([_]u8{ 0x22, 0x23, 0x30, 0x31 }) |tag| {
        try t.expectError(error.InvalidHistoryTextSize, parse(tag, &.{0}));
        const text = try parse(tag, &.{ 0, 0xd8, 0, 0 });
        try t.expectEqualSlices(u8, &.{ 0, 0xd8, 0, 0 }, text.text);
    }
    try t.expectEqualSlices(u8, &.{1}, (try parse(0x21, &.{1})).date_deferred);
    try t.expectEqualSlices(u8, &.{1}, (try parse(0xff, &.{1})).unknown);
}
test "history item start/end and zero record budget" {
    const raw = [_]u8{ 0x10, 6, 0, 0, 0, 0x40, 0x80, 1, 0, 0, 0, 0x11, 0, 0, 0, 0 };
    const item = try h.Item.parse(&raw, .{ .start_layout = .spec_flag_first, .framing = .{ .max_records = 2 } });
    try t.expectEqual(2, item.report.records);
    try t.expectEqual(0x8040, item.start.flags);
    try t.expectError(error.LimitExceeded, h.Item.parse(&raw, .{ .start_layout = .spec_flag_first, .framing = .{ .max_records = 1 } }));
    try t.expectError(error.MissingHistoryEnd, h.Item.parse(raw[0..11], .{ .start_layout = .spec_flag_first }));
    try t.expectError(error.MissingHistoryStart, h.Item.parse(raw[11..], .{ .start_layout = .spec_flag_first }));
    var empty = h.record.Iterator.init(&.{}, .{ .max_records = 0 });
    try t.expect(try empty.next() == null);
}
