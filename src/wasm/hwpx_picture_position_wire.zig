const std = @import("std");
const Values = @import("../hwpx/picture_position_values.zig").Values;
pub fn encode(a: std.mem.Allocator, value: Values) ![]u8 {
    const maxima = [_]u32{ 2, 3, 4, 4 };
    for (value.relations, maxima) |number, maximum| if (number) |actual| {
        if (actual > maximum) return error.InvalidPicturePosition;
    };
    const bytes = try a.alloc(u8, 40);
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[0..4], 0x31505048, .little);
    var presence: u32 = 0;
    for (value.flags, 0..) |flag, index| if (flag) |actual| {
        presence |= @as(u32, 1) << @intCast(index);
        std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], @intFromBool(actual), .little);
    };
    for (value.relations, 0..) |number, index| if (number) |actual| {
        presence |= @as(u32, 1) << @intCast(index + 4);
        std.mem.writeInt(u32, bytes[24 + index * 4 ..][0..4], actual, .little);
    };
    std.mem.writeInt(u32, bytes[4..8], presence, .little);
    return bytes;
}

test "HWPX picture position wire preserves false zero and releases allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try encode(allocator, .{ .flags = .{ false, true, null, null }, .relations = .{ 2, 2, 0, 0 } });
            defer allocator.free(bytes);
            try std.testing.expectEqual(@as(u32, 243), std.mem.readInt(u32, bytes[4..8], .little));
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, bytes[8..12], .little));
            try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, bytes[12..16], .little));
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidPicturePosition, encode(a, .{ .relations = .{ 3, null, null, null } }));
}
