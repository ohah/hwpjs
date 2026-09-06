const std = @import("std");
const t = std.testing;
const body = @import("reader.zig");
const control = @import("control.zig");
const modern = @import("../version.zig").Version{ .raw = 0x05000302 };
fn put(b: []u8, offset: usize, comptime T: type, v: T) void {
    std.mem.writeInt(T, b[offset..][0..@sizeOf(T)], v, .little);
}
test "paragraph header fields, high bit, optional merge and opaque tail" {
    var b = [_]u8{0} ** 25;
    put(&b, 0, u32, 0x8000000c);
    put(&b, 4, u32, 0xffffffff);
    put(&b, 8, u16, 0x1234);
    b[10] = 9;
    b[11] = 0xff;
    put(&b, 12, u16, 1);
    put(&b, 14, u16, 2);
    put(&b, 16, u16, 3);
    put(&b, 18, u32, 0x87654321);
    put(&b, 22, u16, 0x4321);
    b[24] = 0xee;
    const h = try body.Header.parse(&b, modern);
    try t.expectEqual(12, h.characterUnits());
    try t.expect(h.countHighBit());
    try t.expectEqual(0xffffffff, h.control_mask);
    try t.expectEqual(0x1234, h.para_shape_id);
    try t.expectEqual(9, h.style_id);
    try t.expectEqual(255, h.break_flags);
    try t.expectEqual(1, h.char_shape_count);
    try t.expectEqual(2, h.range_tag_count);
    try t.expectEqual(3, h.line_segment_count);
    try t.expectEqual(0x87654321, h.instance_id);
    try t.expectEqual(0x4321, h.merge_tracking.?);
    try t.expectEqualSlices(u8, &.{0xee}, h.extra);
    for (0..24) |n| {
        if (n == 22) continue;
        try t.expectError(error.UnexpectedEnd, body.Header.parse(b[0..n], modern));
    }
    const absent = try body.Header.parse(b[0..22], modern);
    try t.expect(absent.merge_tracking == null);
    const old = try body.Header.parse(&b, .{ .raw = 0x05000301 });
    try t.expect(old.merge_tracking == null);
    try t.expectEqual(3, old.extra.len);
    try t.expectError(error.UnsupportedVersion, body.Header.parse(&b, .{ .raw = 0x06000000 }));
}
test "all control codes use table widths, ignore embedded data and preserve tokens" {
    const widths = [_]usize{ 1, 8, 8, 8, 8, 8, 8, 8, 8, 8, 1, 8, 8, 1, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 1, 1, 1, 1, 1, 1, 1, 1 };
    for (widths, 0..) |width, code| {
        var b = [_]u8{0xff} ** 16;
        put(&b, 0, u16, @intCast(code));
        if (width == 8) put(&b, 14, u16, @intCast(code));
        const text = try body.Text.parse(b[0 .. width * 2]);
        var it = text.tokens();
        const token = (try it.next()).?;
        try t.expectEqual(0, token.start_unit);
        try t.expectEqual(width * 2, token.raw.len);
        try t.expectEqual(code, token.value.control.code);
        try t.expectEqual(width, control.units(token.value.control.kind));
        try t.expect((try it.next()) == null);
        if (width == 8) {
            try t.expectEqualSlices(u8, b[2..14], token.value.control.data);
            for (2..16) |n| {
                if (n % 2 == 1) {
                    try t.expectError(error.InvalidTextSize, body.Text.parse(b[0..n]));
                    continue;
                }
                var truncated = try body.text.Iterator.init(b[0..n]);
                try t.expectError(error.UnexpectedEnd, truncated.next());
                try t.expectEqual(0, truncated.reader.offset);
            }
            put(&b, 14, u16, 32);
            var broken = try body.text.Iterator.init(&b);
            for (0..2) |_| {
                try t.expectError(error.InvalidControlTerminator, broken.next());
                try t.expectEqual(0, broken.reader.offset);
            }
        }
    }
    try t.expect(control.kind(32) == null and control.kind(65535) == null);
}
test "UTF16 runs keep surrogates BOM and original positions around an inline tab" {
    var b = [_]u8{0} ** 28;
    for ([_]u16{ 0xfeff, 0xd83d, 0xde00, 0xd800, 9, 0, 13, 0, 0, 0, 0, 9, 0x41, 13 }, 0..) |unit, i| put(&b, i * 2, u16, unit);
    const text = try body.Text.parse(&b);
    try t.expectEqual(14, text.unitCount());
    var it = text.tokens();
    const plain = (try it.next()).?;
    try t.expectEqualSlices(u8, b[0..8], plain.value.text);
    const tab = (try it.next()).?;
    try t.expectEqual(4, tab.start_unit);
    try t.expectEqual(control.Kind.inline_control, tab.value.control.kind);
    const after = (try it.next()).?;
    try t.expectEqual(12, after.start_unit);
    try t.expectEqualSlices(u8, &.{ 0x41, 0 }, after.value.text);
    const end = (try it.next()).?;
    try t.expectEqual(13, end.start_unit);
    try t.expectEqual(13, end.value.control.code);
    var hb = [_]u8{0} ** 22;
    put(&hb, 0, u32, 0x8000000e);
    const h = try body.Header.parse(&hb, modern);
    try text.validateCount(h);
    put(&hb, 0, u32, 13);
    try t.expectError(error.ParagraphTextCountMismatch, text.validateCount(try body.Header.parse(&hb, modern)));
    try t.expectError(error.InvalidTextSize, body.Text.parse(&.{0}));
    var empty = (try body.Text.parse(&.{})).tokens();
    try t.expect((try empty.next()) == null);
}
test "body dispatch is atomic for malformed known payload, unknown stays raw" {
    var bytes = [_]u8{0} ** 6;
    put(&bytes, 0, u32, 67 | (7 << 10) | (2 << 20));
    put(&bytes, 4, u16, 9);
    var it = try body.Iterator.init(&bytes, modern, .{});
    for (0..2) |_| {
        try t.expectError(error.UnexpectedEnd, it.next());
        try t.expectEqual(0, it.records.reader.offset);
        try t.expectEqual(0, it.records.count);
    }
    put(&bytes, 0, u32, 1023 | (1023 << 10) | (2 << 20));
    it = try body.Iterator.init(&bytes, modern, .{});
    const r = (try it.next()).?;
    try t.expect(r.value == .unknown);
    try t.expectEqual(1023, r.framing.level);
    try t.expectEqualSlices(u8, &bytes, r.framing.raw);
}
