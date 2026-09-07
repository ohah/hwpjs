const std = @import("std");
pub const Sample = struct { raw: u16, value: u16 };
pub fn read(bytes: *const [2]u8, depth: u8) !Sample {
    if (depth != 1 and depth != 2 and depth != 4 and depth != 8 and depth != 16) return error.UnsupportedPngFormat;
    const raw = std.mem.readInt(u16, bytes, .big);
    const mask: u16 = @intCast((@as(u32, 1) << @as(u5, @intCast(depth))) - 1);
    return .{ .raw = raw, .value = raw & mask };
}
