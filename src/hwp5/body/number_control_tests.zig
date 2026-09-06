const std = @import("std");
const t = std.testing;
const n = @import("number_control.zig");
test "number prefix read is atomic and automatic bit views are position specific" {
    var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &.{ 1, 2, 3, 4, 5 } };
    try t.expectError(error.UnexpectedEnd, n.Header.read(&r));
    try t.expectEqual(0, r.offset);
    var raw = [_]u8{0} ** 12;
    for (0..32) |bit| {
        const flags = @as(u32, 1) << @intCast(bit);
        std.mem.writeInt(u32, raw[0..4], flags, .little);
        const v = try n.Auto.parse(&raw);
        try t.expectEqual(flags & 15, v.header.kind());
        try t.expectEqual((flags >> 4) & 255, v.shape());
        try t.expectEqual(bit == 12, v.superscript());
    }
}
test "auto number keeps raw code units and unsigned values including unknown bits" {
    const bytes = [_]u8{ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0xd8, 0, 0, 0xff, 0xfe, 9 };
    const v = try n.Auto.parse(&bytes);
    try t.expectEqual(15, v.header.kind());
    try t.expectEqual(255, v.shape());
    try t.expect(v.superscript());
    try t.expectEqual(65535, v.header.number);
    try t.expectEqual(0xd800, v.symbol);
    try t.expectEqual(0, v.prefix);
    try t.expectEqual(0xfeff, v.suffix);
    try t.expectEqualSlices(u8, &.{9}, v.extra);
    for (0..12) |size| try t.expectError(error.UnexpectedEnd, n.Auto.parse(bytes[0..size]));
}
test "restart six defined bytes retain arbitrary tail without inferred fields" {
    const bytes = [_]u8{ 5, 0, 0, 0x80, 0xff, 0xff, 9, 8, 7 };
    const v = try n.Restart.parse(&bytes);
    try t.expectEqual(0x80000005, v.header.attributes);
    try t.expectEqual(65535, v.header.number);
    try t.expectEqualSlices(u8, bytes[6..], v.extra);
    for (0..6) |size| try t.expectError(error.UnexpectedEnd, n.Restart.parse(bytes[0..size]));
    try t.expect((try n.parse(@import("control_rules.zig").id("newn"), &.{})) == null);
}
