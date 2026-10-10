//! Shared HCS1 serialization, independent of document parsing and CSS.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, shapes: anytype) ![]u8 {
    const count = std.math.cast(u32, shapes.len) orelse return error.LimitExceeded;
    const rows_size = std.math.mul(usize, shapes.len, 12) catch return error.LimitExceeded;
    const length = std.math.add(usize, rows_size, 8) catch return error.LimitExceeded;
    const bytes = try a.alloc(u8, length);
    errdefer a.free(bytes);
    @memcpy(bytes[0..4], "HCS1");
    std.mem.writeInt(u32, bytes[4..8], count, .little);
    var previous: ?u32 = null;
    for (shapes, 0..) |shape, index| {
        const id: u32 = if (@typeInfo(@TypeOf(shape.id)) == .optional) shape.id orelse return error.InvalidCharacterShapes else shape.id;
        if (previous) |value| if (id <= value) return error.InvalidCharacterShapes;
        previous = id;
        const height: ?i32 = shape.height;
        const row = bytes[8 + index * 12 ..][0..12];
        std.mem.writeInt(u32, row[0..4], id, .little);
        std.mem.writeInt(i32, row[4..8], height orelse 0, .little);
        const flags: u32 = @as(u32, @intFromBool(height != null)) | (@as(u32, @intFromBool(shape.bold)) << 1) | (@as(u32, @intFromBool(shape.italic)) << 2);
        std.mem.writeInt(u32, row[8..12], flags, .little);
    }
    return bytes;
}

const TestShape = struct { id: ?u32, height: ?i32, bold: bool, italic: bool };
fn allocationCase(a: std.mem.Allocator) !void {
    const shapes = [_]TestShape{
        .{ .id = 1, .height = null, .bold = false, .italic = true },
        .{ .id = 8, .height = -1, .bold = true, .italic = false },
    };
    const bytes = try encode(a, &shapes);
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 32), bytes.len);
    try std.testing.expectEqual(@as(u32, 4), std.mem.readInt(u32, bytes[16..20], .little));
    try std.testing.expectEqual(@as(i32, -1), std.mem.readInt(i32, bytes[24..28], .little));
    try std.testing.expectEqual(@as(u32, 3), std.mem.readInt(u32, bytes[28..32], .little));
}
test "shared character shapes wire preserves optional height and fails allocations" {
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
    var shapes = [_]TestShape{
        .{ .id = 1, .height = null, .bold = false, .italic = false },
        .{ .id = 1, .height = 0, .bold = false, .italic = false },
    };
    try std.testing.expectError(error.InvalidCharacterShapes, encode(std.testing.allocator, &shapes));
    shapes[1].id = null;
    try std.testing.expectError(error.InvalidCharacterShapes, encode(std.testing.allocator, &shapes));
}
