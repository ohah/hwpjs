const std = @import("std");
pub const Gradient = struct {
    kind: u8,
    angle: u32,
    center_x: u32,
    center_y: u32,
    blur: u32,
    blur_center: ?u8,
    colors: []u32,
    positions: []i32,
    pub fn copy(a: std.mem.Allocator, raw: @import("../docinfo/fill.zig").Gradient, blur_center: ?u8) !Gradient {
        const colors = try a.alloc(u32, raw.count());
        errdefer a.free(colors);
        const positions = try a.alloc(i32, raw.positions.len / 4);
        errdefer a.free(positions);
        for (colors, 0..) |*value, index| value.* = raw.color(index).?;
        for (positions, 0..) |*value, index| value.* = raw.position(index).?;
        return .{ .kind = raw.kind, .angle = raw.angle, .center_x = raw.center_x, .center_y = raw.center_y, .blur = raw.blur, .blur_center = blur_center, .colors = colors, .positions = positions };
    }
    pub fn deinit(self: Gradient, a: std.mem.Allocator) void {
        a.free(self.colors);
        a.free(self.positions);
    }
};
test "drawing gradient snapshot owns raw colors signed positions and allocation failures" {
    const a = std.testing.allocator;
    var colors: [12]u8 = undefined;
    var positions: [12]u8 = undefined;
    for ([_]u32{ 0, 0xffffffff, 0x123456 }, 0..) |value, index| std.mem.writeInt(u32, colors[index * 4 ..][0..4], value, .little);
    for ([_]i32{ -2147483648, 0, 2147483647 }, 0..) |value, index| std.mem.writeInt(i32, positions[index * 4 ..][0..4], value, .little);
    const raw: @import("../docinfo/fill.zig").Gradient = .{ .kind = 255, .angle = 0xffffffff, .center_x = 0, .center_y = 99, .blur = 80, .colors = &colors, .positions = &positions };
    const owned = try Gradient.copy(a, raw, null);
    defer owned.deinit(a);
    try std.testing.expectEqualSlices(u32, &.{ 0, 0xffffffff, 0x123456 }, owned.colors);
    try std.testing.expectEqualSlices(i32, &.{ -2147483648, 0, 2147483647 }, owned.positions);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: @import("../docinfo/fill.zig").Gradient, expected: Gradient) !void {
            const copied = try Gradient.copy(allocator, borrowed, null);
            defer copied.deinit(allocator);
            try std.testing.expectEqualDeep(expected, copied);
        }
    }.run, .{ raw, owned });
    @memset(&colors, 0);
    @memset(&positions, 0);
    try std.testing.expectEqual(@as(u32, 0xffffffff), owned.colors[1]);
    try std.testing.expectEqual(@as(i32, -2147483648), owned.positions[0]);
    try std.testing.expectEqual(null, owned.blur_center);
}
