//! Table 90 text margins and stored last width; no current-layout fallback.
const Reader = @import("../../binary/reader.zig").Reader;
pub const Properties = struct {
    margins: [4]i16,
    last_width: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        var margins: [4]i16 = undefined;
        for (&margins) |*value| value.* = try r.readInt(i16);
        return .{ .margins = margins, .last_width = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
};
test "drawing text properties preserve signed margins stored width and reject all truncations" {
    const std = @import("std");
    const raw = [_]u8{ 0, 128, 255, 127, 255, 255, 0, 0, 255, 255, 255, 255, 9 };
    const actual = try Properties.parse(&raw);
    try std.testing.expectEqual([4]i16{ -32768, 32767, -1, 0 }, actual.margins);
    try std.testing.expectEqual(@as(u32, 0xffffffff), actual.last_width);
    try std.testing.expectEqualSlices(u8, &.{9}, actual.extra);
    for (0..12) |length| try std.testing.expectError(error.UnexpectedEnd, Properties.parse(raw[0..length]));
}
