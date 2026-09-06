const std = @import("std");
const t = std.testing;
const memo = @import("memo_field.zig");
const id = @import("control_rules.zig").id;
test "memo field distinguishes absence zero unknown kind and partial optional index" {
    var p: @import("field_start.zig").Properties = .{ .attributes = 0, .other = 0, .command = "M\x00E\x00M\x00O\x00/\x00", .instance_id = 99, .extra = &.{} };
    try t.expectEqual(null, (try memo.fromField(id("%unk"), p)).?.index);
    var b = [_]u8{0} ** 7;
    @memcpy(b[4..], &[_]u8{ 9, 128, 255 });
    for ([_]u32{ 0, 1, 0x80000000, 0xffffffff }) |n| {
        std.mem.writeInt(u32, b[0..4], n, .little);
        p.extra = &b;
        const r = (try memo.fromField(id("%unk"), p)).?;
        try t.expectEqual(n, r.index.?);
        try t.expectEqualSlices(u8, b[4..], r.extra);
        try t.expectEqual(b[4..].ptr, r.extra.ptr);
    }
    for (1..4) |end| {
        p.extra = b[0..end];
        try t.expectError(error.UnexpectedEnd, memo.fromField(id("%%me"), p));
        try t.expectError(error.UnexpectedEnd, memo.fromField(id("%unk"), p));
        try t.expectEqual(null, try memo.fromField(id("%hlk"), p));
    }
    p.command = "M\x00E\x00M\x00O\x00";
    try t.expectEqual(null, try memo.fromField(id("%unk"), p));
    p.extra = &.{};
    try t.expect((try memo.fromField(id("%%me"), p)) != null);
    for ([_][]const u8{ "", "MEMO/", "m\x00e\x00m\x00o\x00/\x00", "M\x00E\x00M\x00O\x00?\x00" }) |command| try t.expect(!memo.isCommand(command));
}
