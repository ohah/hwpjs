const std = @import("std");
const t = std.testing;
const p = @import("page_visibility.zig");
test "hide widths are explicit, not short-record fallback" {
    const b = [_]u8{ 0x3f, 0x80, 1, 0x80, 9 };
    const spec = try p.Hide.parse(&b, .spec16);
    const observed = try p.Hide.parse(&b, .observed32);
    try t.expectEqual(0x803f, spec.attributes);
    try t.expectEqual(0x8001803f, observed.attributes);
    try t.expectEqualSlices(u8, b[2..], spec.extra);
    try t.expectEqualSlices(u8, &.{9}, observed.extra);
    for (0..4) |n| try t.expectError(error.UnexpectedEnd, p.Hide.parse(b[0..n], .observed32));
    for (0..2) |n| try t.expectError(error.UnexpectedEnd, p.Hide.parse(b[0..n], .spec16));
}
test "visibility masks and parity preserve every unknown bit" {
    var b = [_]u8{0} ** 4;
    for (0..32) |bit| {
        const flags = @as(u32, 1) << @intCast(bit);
        std.mem.writeInt(u32, &b, flags, .little);
        const hide = try p.Hide.parse(&b, .observed32);
        inline for (std.meta.fields(p.Target)) |field| try t.expectEqual(flags & field.value != 0, hide.hides(@enumFromInt(field.value)));
        try t.expectEqual(flags & ~@as(u32, 63), hide.unknownBits());
        try t.expectEqual(flags & 3, (try p.Parity.parse(&b)).kind());
    }
    for (0..4) |n| try t.expectError(error.UnexpectedEnd, p.Parity.parse(b[0..n]));
    try t.expect((try p.parse(@import("control_rules.zig").id("pgad"), &.{}, .observed32)) == null);
}
