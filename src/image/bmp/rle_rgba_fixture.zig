const std = @import("std");
pub const options: @import("pixels.zig").Options = .{
    .colour_management = .unmanaged,
    .mask_scaling = .nearest_normalized,
    .rle = .{ .raster = .{ .commands = .{ .padding = .require_zero }, .completion = .preserve_unwritten }, .unwritten = .transparent },
};
pub fn bitmap(a: std.mem.Allocator, bits: u16, full: bool) ![]u8 {
    const raw = try @import("rle_fixture.zig").bitmap(a, if (full) &.{ 2, 0, 0, 0, 2, 0, 0, 1 } else &.{ 1, 0, 0, 1 }, bits, 2, 2);
    raw[54..58].* = .{ 7, 11, 17, 0 };
    return raw;
}
