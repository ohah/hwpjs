const std = @import("std");
const gradient_fill_mode = @import("gradient_fill_mode.zig");

pub const byte_size: usize = 12;

pub const Rectangle = struct {
    upper_left: u32,
    lower_right: u32,
    padding: *const [4]u8,
};

pub const Triangle = struct { vertex1: u32, vertex2: u32, vertex3: u32 };
pub const Mesh = union(enum) { rectangle: Rectangle, triangle: Triangle };

pub fn parse(bytes: []const u8, mode: gradient_fill_mode.GradientFillMode, vertex_count: u32) !Mesh {
    if (bytes.len != byte_size) return error.InvalidEmfGradientMeshSize;
    if (mode.isRectangle()) {
        const upper_left = std.mem.readInt(u32, bytes[0..4], .little);
        const lower_right = std.mem.readInt(u32, bytes[4..8], .little);
        try validateIndex(upper_left, vertex_count);
        try validateIndex(lower_right, vertex_count);
        return .{ .rectangle = .{ .upper_left = upper_left, .lower_right = lower_right, .padding = bytes[8..12] } };
    }
    const value: Triangle = .{
        .vertex1 = std.mem.readInt(u32, bytes[0..4], .little),
        .vertex2 = std.mem.readInt(u32, bytes[4..8], .little),
        .vertex3 = std.mem.readInt(u32, bytes[8..12], .little),
    };
    try validateIndex(value.vertex1, vertex_count);
    try validateIndex(value.vertex2, vertex_count);
    try validateIndex(value.vertex3, vertex_count);
    return .{ .triangle = value };
}

fn validateIndex(index: u32, vertex_count: u32) !void {
    if (index >= vertex_count) return error.EmfGradientVertexIndexOutOfBounds;
}

test "gradient mesh distinguishes rectangle padding from triangle third index" {
    var bytes = [_]u8{0} ** byte_size;
    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    std.mem.writeInt(u32, bytes[4..8], 2, .little);
    bytes[8..12].* = .{ 9, 8, 7, 6 };
    const rectangle = (try parse(&bytes, .rectangle_vertical, 3)).rectangle;
    try std.testing.expectEqual(@as(u32, 1), rectangle.upper_left);
    try std.testing.expectEqual(@as(u32, 2), rectangle.lower_right);
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, rectangle.padding);

    std.mem.writeInt(u32, bytes[8..12], 0, .little);
    const triangle = (try parse(&bytes, .triangle, 3)).triangle;
    try std.testing.expectEqual(@as(u32, 0), triangle.vertex3);
}

test "gradient mesh validates exact size and every referenced vertex" {
    var bytes = [_]u8{0} ** byte_size;
    try std.testing.expectError(error.InvalidEmfGradientMeshSize, parse(bytes[0..11], .triangle, 1));
    inline for (0..3) |index| {
        bytes = [_]u8{0} ** byte_size;
        std.mem.writeInt(u32, bytes[index * 4 ..][0..4], 1, .little);
        try std.testing.expectError(error.EmfGradientVertexIndexOutOfBounds, parse(&bytes, .triangle, 1));
    }
    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    try std.testing.expectError(error.EmfGradientVertexIndexOutOfBounds, parse(&bytes, .rectangle_horizontal, 1));
    bytes = [_]u8{0} ** byte_size;
    std.mem.writeInt(u32, bytes[4..8], 1, .little);
    try std.testing.expectError(error.EmfGradientVertexIndexOutOfBounds, parse(&bytes, .rectangle_vertical, 1));
}
