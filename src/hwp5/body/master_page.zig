//! Table 137 master-page area, excluding the owner's LIST_HEADER prefix.
const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;

pub const Area = struct {
    width: u32,
    height: u32,
    text_reference: u8,
    number_reference: u8,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !Area {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .width = try r.readInt(u32),
            .height = try r.readInt(u32),
            .text_reference = try r.readInt(u8),
            .number_reference = try r.readInt(u8),
            .extra = bytes[r.offset..],
        };
    }
};

test "master page area requires its complete prefix and retains extensions" {
    const bytes = [_]u8{ 1, 0, 0, 0, 2, 0, 0, 0, 255, 128, 7, 8 };
    for (0..10) |len| try std.testing.expectError(error.UnexpectedEnd, Area.parse(bytes[0..len]));
    const area = try Area.parse(&bytes);
    try std.testing.expectEqual(@as(u32, 1), area.width);
    try std.testing.expectEqual(@as(u32, 2), area.height);
    try std.testing.expectEqual(@as(u8, 255), area.text_reference);
    try std.testing.expectEqual(@as(u8, 128), area.number_reference);
    try std.testing.expectEqualSlices(u8, bytes[10..], area.extra);
    const empty = try Area.parse(&([_]u8{0} ** 10));
    try std.testing.expectEqual(@as(u32, 0), empty.width);
}
