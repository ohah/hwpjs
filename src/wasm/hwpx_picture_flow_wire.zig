const std = @import("std");
const Values = @import("../hwpx/picture_flow_values.zig").Values;

pub fn encode(a: std.mem.Allocator, value: Values) ![]u8 {
    if (value.text_wrap) |number| if (number > 5) return error.InvalidPictureFlow;
    if (value.text_flow) |number| if (number > 3) return error.InvalidPictureFlow;
    const signed = [5]?i64{ value.z_order, value.outside_margins[0], value.outside_margins[1], value.outside_margins[2], value.outside_margins[3] };
    for (signed) |number| if (number) |actual| {
        if (actual < -2147483648 or actual > 4294967295) return error.InvalidPictureFlow;
    };
    const bytes = try a.alloc(u8, 56);
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[0..4], 0x31465048, .little);
    var presence: u32 = 0;
    for ([2]?u32{ value.text_wrap, value.text_flow }, 0..) |number, index| if (number) |actual| {
        presence |= @as(u32, 1) << @intCast(index);
        std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], actual, .little);
    };
    for (signed, 0..) |number, index| if (number) |actual| {
        presence |= @as(u32, 1) << @intCast(index + 2);
        std.mem.writeInt(i64, bytes[16 + index * 8 ..][0..8], actual, .little);
    };
    std.mem.writeInt(u32, bytes[4..8], presence, .little);
    return bytes;
}

test "HWPX picture flow wire preserves signed zero absence and allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try encode(allocator, .{ .text_wrap = 0, .z_order = -1, .outside_margins = .{ 0, null, null, 4294967295 } });
            defer allocator.free(bytes);
            try std.testing.expectEqual(@as(u32, 77), std.mem.readInt(u32, bytes[4..8], .little));
            try std.testing.expectEqual(@as(i64, -1), std.mem.readInt(i64, bytes[16..24], .little));
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidPictureFlow, encode(a, .{ .text_wrap = 6 }));
    try std.testing.expectError(error.InvalidPictureFlow, encode(a, .{ .z_order = -2147483649 }));
}
