const std = @import("std");

pub const Rect = struct { left: i16, top: i16, right: i16, bottom: i16 };

pub fn readLTRB(bytes: *const [8]u8) Rect {
    return .{
        .left = std.mem.readInt(i16, bytes[0..2], .little),
        .top = std.mem.readInt(i16, bytes[2..4], .little),
        .right = std.mem.readInt(i16, bytes[4..6], .little),
        .bottom = std.mem.readInt(i16, bytes[6..8], .little),
    };
}

pub fn readBRTL(bytes: *const [8]u8) Rect {
    return .{
        .left = std.mem.readInt(i16, bytes[6..8], .little),
        .top = std.mem.readInt(i16, bytes[4..6], .little),
        .right = std.mem.readInt(i16, bytes[2..4], .little),
        .bottom = std.mem.readInt(i16, bytes[0..2], .little),
    };
}
