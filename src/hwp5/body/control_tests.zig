const std = @import("std");
const t = std.testing;
const b = @import("reader.zig");
test "control ID preserves four bytes and opaque properties" {
    const raw = [_]u8{ 32, 'l', 'b', 't', 255, 0 };
    for (0..4) |n| try t.expectError(error.UnexpectedEnd, b.ControlHeader.parse(raw[0..n]));
    const h = try b.ControlHeader.parse(&raw);
    try t.expectEqualSlices(u8, "tbl ", &h.name());
    try t.expectEqualSlices(u8, raw[4..], h.properties);
    const binary = try b.ControlHeader.parse(&.{ 0, 255, 128, 0 });
    try t.expectEqualSlices(u8, &.{ 0, 128, 255, 0 }, &binary.name());
}
test "list views explicitly distinguish six and eight byte layouts without normalization" {
    const raw = [_]u8{ 255, 255, 0x34, 0x12, 0x51, 0, 0, 0x80, 0xaa };
    for (0..6) |n| try t.expectError(error.UnexpectedEnd, b.ListHeader.parse(raw[0..n]));
    for (6..8) |n| try t.expectError(error.UnexpectedEnd, (try b.ListHeader.parse(raw[0..n])).view(.observed8));
    const h = try b.ListHeader.parse(&raw);
    try t.expectEqual(65535, h.count_raw);
    try t.expectEqual(-1, h.signedCount());
    const spec = try h.view(.spec6);
    try t.expect(spec.unknown == null);
    try t.expectEqual(0x00511234, spec.attributes);
    try t.expectEqualSlices(u8, raw[6..], spec.extra);
    const observed = try h.view(.observed8);
    try t.expectEqual(0x1234, observed.unknown.?);
    try t.expectEqual(0x80000051, observed.attributes);
    try t.expectEqual(1, observed.direction());
    try t.expectEqual(2, observed.wrapping());
    try t.expectEqual(2, observed.alignment());
    try t.expectEqualSlices(u8, raw[8..], observed.extra);
}
test "control and list short payloads leave dispatch unchanged" {
    for ([_]u32{ 71, 72 }) |tag| {
        var bytes = [_]u8{0} ** 7;
        std.mem.writeInt(u32, bytes[0..4], tag | (3 << 20), .little);
        var it = try b.Iterator.init(&bytes, .{ .raw = 0x05000307 }, .{});
        for (0..2) |_| {
            try t.expectError(error.UnexpectedEnd, it.next());
            try t.expectEqual(0, it.records.reader.offset);
            try t.expectEqual(0, it.records.count);
        }
    }
}
