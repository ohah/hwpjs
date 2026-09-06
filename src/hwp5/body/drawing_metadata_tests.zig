const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Metadata = @import("drawing_metadata.zig").Metadata;
const Style = @import("drawing_style.zig").Style;
test "drawing metadata preserves full widths and restores a nonzero cursor on truncation" {
    const raw = [_]u8{ 9, 8, 7, 255, 255, 255, 255, 128, 255, 6 };
    var reader: Reader = .{ .bytes = &raw, .offset = 3 };
    const p = try Metadata.read(&reader);
    try t.expectEqual(0xffffffff, p.instance_id);
    try t.expectEqual(128, p.reserved);
    try t.expectEqual(255, p.shadow_alpha);
    try t.expectEqual(9, reader.offset);
    for (3..9) |end| {
        var short: Reader = .{ .bytes = raw[0..end], .offset = 3 };
        try t.expectError(error.UnexpectedEnd, Metadata.read(&short));
        try t.expectEqual(3, short.offset);
    }
}
test "drawing suffix absence and zero differ and no layout is inferred from length" {
    var raw = [_]u8{0} ** 45;
    raw[43] = 7;
    raw[44] = 9;
    const old = try Style.parse(&raw, .observed13);
    try t.expectEqual(null, old.tail.known.metadata);
    try t.expectEqualSlices(u8, raw[37..], old.tail.known.extra);
    const selected = try Style.parseWithTail(&raw, .observed13, .alpha_shadow_metadata);
    try t.expectEqual(0, selected.tail.known.metadata.?.instance_id);
    try t.expectEqual(0, selected.tail.known.metadata.?.reserved);
    try t.expectEqual(0, selected.tail.known.metadata.?.shadow_alpha);
    try t.expectEqualSlices(u8, &.{ 7, 9 }, selected.tail.known.extra);
    for (37..43) |end| {
        try t.expectError(error.UnexpectedEnd, Style.parseWithTail(raw[0..end], .observed13, .alpha_shadow_metadata));
        try t.expectEqual(null, (try Style.parse(raw[0..end], .observed13)).tail.known.metadata);
    }
    std.mem.writeInt(u32, raw[13..17], 0x80000000, .little);
    const unknown = try Style.parseWithTail(&raw, .observed13, .alpha_shadow_metadata);
    try t.expect(unknown.tail == .unknown);
    try t.expectEqualSlices(u8, raw[17..], unknown.tail.unknown);
}
