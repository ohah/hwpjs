const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Alpha = @import("../docinfo/fill_alpha.zig").Alpha;
test "style diagnostics distinguish unsupported unselected unknown and parsed atomically" {
    const Component = @import("shape_component.zig").Component;
    const validation = @import("drawing_style_validation.zig");
    var raw = [_]u8{0} ** 137;
    var p = try Component.parse(&raw, .double_id);
    var report: validation.Report = .{};
    try report.add(p, .{ .tail = .alpha_shadow }, 0);
    try t.expectEqual(1, report.unsupported);
    p.id = 0x24726563;
    p.extra = &.{};
    try report.add(p, null, 0);
    try t.expectEqual(1, report.unselected);
    const before = report;
    try t.expectError(error.UnexpectedEnd, report.add(p, .{ .tail = .alpha_shadow }, 0));
    try t.expectEqualDeep(before, report);
    p.extra = raw[100..];
    try report.add(p, .{ .tail = .alpha_shadow }, 0);
    try t.expectEqual(1, report.parsed);
    std.mem.writeInt(u32, raw[113..117], 0x80000000, .little);
    try report.add(p, .{ .tail = .alpha_shadow }, 0);
    try t.expectEqual(1, report.unknown);
    try t.expectEqual(20, report.extra_bytes);
    try t.expectEqual(report.supported, report.unselected + report.parsed + report.unknown);
}
test "older gradient style reuses Fill fields without manufacturing alpha" {
    const Style = @import("drawing_style.zig").Style;
    var raw: [51]u8 = undefined;
    _ = try std.fmt.hexToBytes(&raw, "00000000c8000000410000c00004000000020000000032000000320000005000000002000000ffffff003366ff000100000050");
    const style = try Style.parseWithTail(&raw, .observed13, .fill_only);
    try t.expectEqual(200, style.border.width);
    try t.expectEqual(4, style.fill.flags);
    const fill = style.fill.data.known;
    const gradient = fill.gradient.?;
    try t.expectEqual(2, gradient.kind);
    try t.expectEqual(0, gradient.angle);
    try t.expectEqual(50, gradient.center_x);
    try t.expectEqual(50, gradient.center_y);
    try t.expectEqual(80, gradient.blur);
    try t.expectEqual(2, gradient.count());
    try t.expectEqual(0x00ffffff, gradient.color(0).?);
    try t.expectEqual(0x00ff6633, gradient.color(1).?);
    try t.expectEqual(null, gradient.color(2));
    try t.expectEqual(null, gradient.position(0));
    try t.expectEqual(80, fill.blurCenter().?);
    try t.expect(style.tail == .fill_only);
    try t.expectEqual(0, style.tail.fill_only.len);
    try t.expectError(error.UnexpectedEnd, Style.parse(&raw, .observed13));
    // A hostile count must fail, never consume it as an opaque older extension.
    std.mem.writeInt(u32, raw[34..38], 0xffffffff, .little);
    try t.expectError(error.UnexpectedEnd, Style.parseWithTail(&raw, .observed13, .fill_only));
}
test "explicit fill-only style preserves absence and does not guess a shadow" {
    const Style = @import("drawing_style.zig").Style;
    const raw = [_]u8{0} ** 37;
    const short = try Style.parseWithTail(raw[0..21], .observed13, .fill_only);
    try t.expect(short.tail == .fill_only);
    try t.expectEqual(0, short.tail.fill_only.len);
    try t.expectError(error.UnexpectedEnd, Style.parse(raw[0..21], .observed13));
    for (0..21) |n| try t.expectError(error.UnexpectedEnd, Style.parseWithTail(raw[0..n], .observed13, .fill_only));
    const extra = try Style.parseWithTail(&raw, .observed13, .fill_only);
    try t.expectEqualSlices(u8, raw[21..], extra.tail.fill_only);
    try t.expectEqual(raw[21..].ptr, extra.tail.fill_only.ptr);
    try t.expectEqual(0, (try Style.parse(&raw, .observed13)).tail.known.shadow.kind);
    var unknown = raw;
    std.mem.writeInt(u32, unknown[13..17], 0x80000000, .little);
    const preserved = try Style.parseWithTail(&unknown, .observed13, .fill_only);
    try t.expect(preserved.tail == .unknown);
    try t.expectEqualSlices(u8, unknown[17..], preserved.tail.unknown);
}
test "per-type alpha keeps zero and mixed types in pattern-gradient-image order" {
    for (0..8) |flags| {
        const values = [_]u8{ 0, 128, 255 };
        var r: Reader = .{ .bytes = &values };
        const a = try Alpha.read(&r, @intCast(flags));
        var expected: usize = 0;
        inline for (.{ "pattern", "gradient", "image" }, .{ 1, 4, 2 }) |field, mask| {
            if (flags & mask != 0) {
                try t.expectEqual(values[expected], @field(a, field).?);
                expected += 1;
            } else try t.expectEqual(null, @field(a, field));
        }
        try t.expectEqual(expected, r.offset);
        for (0..expected) |n| {
            var short: Reader = .{ .bytes = values[0..n] };
            try t.expectError(error.UnexpectedEnd, Alpha.read(&short, @intCast(flags)));
            try t.expectEqual(0, short.offset);
        }
    }
    var r: Reader = .{ .bytes = &.{} };
    try t.expectError(error.UnsupportedFillKind, Alpha.read(&r, 8));
    try t.expectEqual(0, r.offset);
}
test "drawing shadow widths and unknown fill do not consume guessed tails" {
    const Style = @import("drawing_style.zig").Style;
    var raw = [_]u8{0} ** 38;
    std.mem.writeInt(u32, raw[21..25], 0xffffffff, .little);
    std.mem.writeInt(u32, raw[25..29], 0x80000000, .little);
    std.mem.writeInt(i32, raw[29..33], -2147483648, .little);
    std.mem.writeInt(i32, raw[33..37], 2147483647, .little);
    raw[37] = 9;
    const p = try Style.parse(&raw, .observed13);
    try t.expectEqual(0xffffffff, p.tail.known.shadow.kind);
    try t.expectEqual(0x80000000, p.tail.known.shadow.color);
    try t.expectEqual(-2147483648, p.tail.known.shadow.offset_x);
    try t.expectEqual(2147483647, p.tail.known.shadow.offset_y);
    try t.expectEqualSlices(u8, &.{9}, p.tail.known.extra);
    for (0..37) |n| try t.expectError(error.UnexpectedEnd, Style.parse(raw[0..n], .observed13));
    for (0..16) |n| {
        var r: Reader = .{ .bytes = raw[21..][0..n] };
        try t.expectError(error.UnexpectedEnd, @import("shadow.zig").Shadow.read(&r));
        try t.expectEqual(0, r.offset);
    }
    std.mem.writeInt(u32, raw[13..17], 0x80000000, .little);
    const unknown = try Style.parse(&raw, .observed13);
    try t.expectEqualSlices(u8, raw[17..], unknown.tail.unknown);
    try t.expectEqual(0, (try Style.parse(raw[0..17], .observed13)).tail.unknown.len);
}
