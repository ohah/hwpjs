const std = @import("std");

pub const Point = struct { x: i16, y: i16 };

pub fn readXY(bytes: *const [4]u8) Point {
    return .{
        .x = std.mem.readInt(i16, bytes[0..2], .little),
        .y = std.mem.readInt(i16, bytes[2..4], .little),
    };
}

pub fn readYX(bytes: *const [4]u8) Point {
    return .{
        .x = std.mem.readInt(i16, bytes[2..4], .little),
        .y = std.mem.readInt(i16, bytes[0..2], .little),
    };
}
