//! Observed eight-unit title marks; no TOC generation or command execution.
const std = @import("std");
const controls = @import("control_rules.zig");
pub const Kind = enum { mtit, mign };
pub fn parse(c: @import("control.zig").Control) !Kind {
    if (c.code != 8 or c.kind != .inline_control or c.data.len != 12 or c.closing_code != 8) return error.InvalidTitleMark;
    const id = std.mem.readInt(u32, c.data[0..4], .little);
    const kind: Kind = if (id == controls.id("Mtit")) .mtit else if (id == controls.id("Mign")) .mign else return error.UnsupportedTitleMark;
    const zero = [_]u8{0} ** 8;
    const spaces = [_]u8{ ' ', 0, ' ', 0, ' ', 0, ' ', 0 };
    if (!std.mem.eql(u8, c.data[4..], &zero) and !(kind == .mtit and std.mem.eql(u8, c.data[4..], &spaces))) return error.UnsupportedTitleMarkData;
    return kind;
}

test "title mark retains exact observed IDs and refuses unknown payload fields" {
    var data = [_]u8{0} ** 12;
    var c = @import("control.zig").Control{ .code = 8, .kind = .inline_control, .data = &data, .closing_code = 8 };
    inline for (.{ .{ "Mtit", Kind.mtit }, .{ "Mign", Kind.mign } }) |case| {
        std.mem.writeInt(u32, data[0..4], controls.id(case[0]), .little);
        try std.testing.expectEqual(case[1], try parse(c));
        for (4..12) |index| {
            data[index] = 1;
            try std.testing.expectError(error.UnsupportedTitleMarkData, parse(c));
            data[index] = 0;
        }
    }
    std.mem.writeInt(u32, data[0..4], controls.id("fake"), .little);
    try std.testing.expectError(error.UnsupportedTitleMark, parse(c));
    c.closing_code = 7;
    try std.testing.expectError(error.InvalidTitleMark, parse(c));
    c.closing_code = 8;
    @memcpy(data[4..], &[_]u8{ ' ', 0, ' ', 0, ' ', 0, ' ', 0 });
    std.mem.writeInt(u32, data[0..4], controls.id("Mtit"), .little);
    try std.testing.expectEqual(Kind.mtit, try parse(c));
    data[4] = 0;
    try std.testing.expectError(error.UnsupportedTitleMarkData, parse(c));
    data[4] = ' ';
    std.mem.writeInt(u32, data[0..4], controls.id("Mign"), .little);
    try std.testing.expectError(error.UnsupportedTitleMarkData, parse(c));
}
