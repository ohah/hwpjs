const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selected = try @import("bmp-rle-options.zig").read(&r);
    const rgba = try r.readInt(u32);
    if (limit < 44) return error.LimitExceeded;
    var image = try core.image.bmp_pixels.decode(a, bytes[r.offset..], .{ .colour_management = .unmanaged, .mask_scaling = .nearest_normalized, .rle = selected, .max_rgba_bytes = @min(rgba, limit - 44) });
    defer image.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]usize{ image.width, image.height, image.rgba.len, @intFromBool(image.metadata_deferred), @intFromBool(image.rle != null) }) |value| try int(a, &out, u32, @intCast(value));
    if (image.rle) |e| {
        for ([_]usize{ @intFromEnum(e.unwritten), e.written_pixels, e.unwritten_pixels, e.commands, e.consumed_bytes, e.trailing_bytes }) |value| try int(a, &out, u32, @intCast(value));
    } else try out.appendNTimes(a, 0, 24);
    try out.appendSlice(a, image.rgba);
    return out.toOwnedSlice(a);
}
