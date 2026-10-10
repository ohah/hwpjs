//! 그림 자르기 원값의 존재 비트와 좌표를 분리합니다.
const std = @import("std");
const Values = @import("../hwpx/picture_crop_values.zig").Values;
pub fn encode(a: std.mem.Allocator, value: Values) ![]u8 {
    const bytes = try a.alloc(u8, 48);
    @memset(bytes, 0);
    @memcpy(bytes[0..4], "HPC1");
    var flags: u32 = 0;
    for (value.clip, 0..) |coordinate, index| {
        if (coordinate != null) flags |= @as(u32, 1) << @intCast(index);
        const at = 8 + index * 8;
        std.mem.writeInt(i64, bytes[at..][0..8], coordinate orelse 0, .little);
    }
    for (value.image_dimensions, 0..) |dimension, index| {
        if (dimension != null) flags |= @as(u32, 1) << @intCast(index + 4);
        const at = 40 + index * 4;
        std.mem.writeInt(u32, bytes[at..][0..4], dimension orelse 0, .little);
    }
    std.mem.writeInt(u32, bytes[4..8], flags, .little);
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = try encode(a, .{ .clip = .{ -1, 0, null, 4294967295 }, .image_dimensions = .{ 0, null } });
    defer a.free(bytes);
    try std.testing.expectEqual(@as(u32, 27), std.mem.readInt(u32, bytes[4..8], .little));
    try std.testing.expectEqual(@as(i64, -1), std.mem.readInt(i64, bytes[8..16], .little));
}
test "HWPX picture crop wire owns bounded optional scalar output" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
