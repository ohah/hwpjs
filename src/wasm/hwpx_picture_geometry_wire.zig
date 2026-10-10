//! 그림 기하 원값과 존재 비트를 분리한 고정 길이 응답입니다.
const std = @import("std");
const Values = @import("../hwpx/picture_geometry_values.zig").Values;
pub fn encode(a: std.mem.Allocator, value: Values) ![]u8 {
    const bytes = try a.alloc(u8, 48);
    @memset(bytes, 0);
    @memcpy(bytes[0..4], "HPG1");
    const numbers = [_]?u32{ value.width, value.height, value.width_relative, value.height_relative, if (value.treat_as_character) |present| @intFromBool(present) else null };
    var flags: u32 = 0;
    for (numbers, 0..) |number, index| {
        if (number != null) flags |= @as(u32, 1) << @intCast(index);
        const at = 8 + index * 4;
        std.mem.writeInt(u32, bytes[at..][0..4], number orelse 0, .little);
    }
    for ([_]?i64{ value.horizontal_offset, value.vertical_offset }, 0..) |number, index| {
        if (number != null) flags |= @as(u32, 1) << @intCast(index + 5);
        const at = 32 + index * 8;
        std.mem.writeInt(i64, bytes[at..][0..8], number orelse 0, .little);
    }
    std.mem.writeInt(u32, bytes[4..8], flags, .little);
    return bytes;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = try encode(a, .{ .width = 0, .treat_as_character = false, .horizontal_offset = -1 });
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 48), bytes.len);
    try std.testing.expectEqual(@as(u32, 49), std.mem.readInt(u32, bytes[4..8], .little));
    try std.testing.expectEqual(@as(i64, -1), std.mem.readInt(i64, bytes[32..40], .little));
}
test "HWPX picture geometry wire preserves optional zero false and signed offsets" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
