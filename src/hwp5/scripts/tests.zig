const std = @import("std");
const t = std.testing;
const Source = @import("source.zig").Source;
const Version = @import("version.zig").Version;
test "script version retains unsigned halves and unknown extension" {
    const raw = [_]u8{ 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0x80, 7 };
    const v = try Version.parse(&raw);
    try t.expectEqual(0xffffffff, v.high);
    try t.expectEqual(0x80000000, v.low);
    try t.expectEqualSlices(u8, &.{7}, v.extra);
    for (0..8) |n| try t.expectError(error.UnexpectedEnd, Version.parse(raw[0..n]));
}
test "script counted fields preserve odd alignment, null and lone surrogate without termination" {
    const raw = [_]u8{ 1, 0, 0, 0, 0, 0xd8, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 'x', 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 9 };
    const s = try Source.parse(&raw);
    try t.expectEqualSlices(u8, &.{ 0, 0xd8 }, s.header);
    try t.expectEqualSlices(u8, &.{ 0, 0 }, s.source);
    try t.expectEqualSlices(u8, &.{ 'x', 0 }, s.pre);
    try t.expectEqual(0, s.post.len);
    try t.expectEqualSlices(u8, &.{9}, s.extra);
    for (0..26) |n| try t.expectError(error.UnexpectedEnd, Source.parse(raw[0..n]));
}
test "all four script lengths reject overflow and every non-minus-one flag bit" {
    var raw = [_]u8{0} ** 20;
    @memset(raw[16..], 255);
    const good = raw;
    for (0..4) |i| {
        raw = good;
        std.mem.writeInt(u32, raw[i * 4 ..][0..4], 0xffffffff, .little);
        try t.expectError(error.UnexpectedEnd, Source.parse(&raw));
    }
    for (0..32) |bit| {
        raw = good;
        std.mem.writeInt(u32, raw[16..20], 0xffffffff ^ (@as(u32, 1) << @intCast(bit)), .little);
        try t.expectError(error.InvalidScriptEndFlag, Source.parse(&raw));
    }
    _ = try Source.parse(&good);
}
