const std = @import("std");

pub const PointL = struct { x: i32, y: i32 };
pub const PointS = struct { x: i16, y: i16 };
pub const SizeL = struct { width: i32, height: i32 };
pub const RectL = struct { left: i32, top: i32, right: i32, bottom: i32 };

pub fn parsePointL(bytes: []const u8) !PointL {
    if (bytes.len != 8) return error.InvalidEmfPointLSize;
    return .{
        .x = std.mem.readInt(i32, bytes[0..4], .little),
        .y = std.mem.readInt(i32, bytes[4..8], .little),
    };
}

pub fn parsePointS(bytes: []const u8) !PointS {
    if (bytes.len != 4) return error.InvalidEmfPointSSize;
    return .{
        .x = std.mem.readInt(i16, bytes[0..2], .little),
        .y = std.mem.readInt(i16, bytes[2..4], .little),
    };
}

pub fn parseSizeL(bytes: []const u8) !SizeL {
    if (bytes.len != 8) return error.InvalidEmfSizeLSize;
    return .{
        .width = std.mem.readInt(i32, bytes[0..4], .little),
        .height = std.mem.readInt(i32, bytes[4..8], .little),
    };
}

pub fn parseRectL(bytes: []const u8) !RectL {
    if (bytes.len != 16) return error.InvalidEmfRectLSize;
    return .{
        .left = std.mem.readInt(i32, bytes[0..4], .little),
        .top = std.mem.readInt(i32, bytes[4..8], .little),
        .right = std.mem.readInt(i32, bytes[8..12], .little),
        .bottom = std.mem.readInt(i32, bytes[12..16], .little),
    };
}

test "signed geometry objects preserve documented wire order" {
    var point_bytes = [_]u8{0} ** 8;
    std.mem.writeInt(i32, point_bytes[0..4], -2, .little);
    std.mem.writeInt(i32, point_bytes[4..8], 3, .little);
    const point = try parsePointL(&point_bytes);
    try std.testing.expectEqual(@as(i32, -2), point.x);
    try std.testing.expectEqual(@as(i32, 3), point.y);
    const size = try parseSizeL(&point_bytes);
    try std.testing.expectEqual(@as(i32, -2), size.width);
    try std.testing.expectEqual(@as(i32, 3), size.height);

    var rect_bytes = [_]u8{0} ** 16;
    for ([_]i32{ -4, -3, 2, 1 }, 0..) |value, index|
        std.mem.writeInt(i32, rect_bytes[index * 4 ..][0..4], value, .little);
    const rect = try parseRectL(&rect_bytes);
    try std.testing.expectEqual(@as(i32, -4), rect.left);
    try std.testing.expectEqual(@as(i32, -3), rect.top);
    try std.testing.expectEqual(@as(i32, 2), rect.right);
    try std.testing.expectEqual(@as(i32, 1), rect.bottom);
}

test "geometry objects reject truncated and oversized inputs" {
    const bytes = [_]u8{0} ** 17;
    try std.testing.expectError(error.InvalidEmfPointLSize, parsePointL(bytes[0..7]));
    try std.testing.expectError(error.InvalidEmfPointLSize, parsePointL(bytes[0..9]));
    try std.testing.expectError(error.InvalidEmfSizeLSize, parseSizeL(bytes[0..7]));
    try std.testing.expectError(error.InvalidEmfSizeLSize, parseSizeL(bytes[0..9]));
    try std.testing.expectError(error.InvalidEmfRectLSize, parseRectL(bytes[0..15]));
    try std.testing.expectError(error.InvalidEmfRectLSize, parseRectL(&bytes));
    try std.testing.expectError(error.InvalidEmfPointSSize, parsePointS(bytes[0..3]));
    try std.testing.expectError(error.InvalidEmfPointSSize, parsePointS(bytes[0..5]));
}

test "PointS preserves signed XY wire order" {
    var bytes = [_]u8{0} ** 4;
    std.mem.writeInt(i16, bytes[0..2], std.math.minInt(i16), .little);
    std.mem.writeInt(i16, bytes[2..4], std.math.maxInt(i16), .little);
    const point = try parsePointS(&bytes);
    try std.testing.expectEqual(@as(i16, std.math.minInt(i16)), point.x);
    try std.testing.expectEqual(@as(i16, std.math.maxInt(i16)), point.y);
}
