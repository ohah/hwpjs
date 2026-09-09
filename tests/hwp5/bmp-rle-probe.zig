const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const padding = try r.readInt(u8);
    const full = try r.readInt(u8);
    const trailing = try r.readInt(u8);
    const indices = try r.readInt(u32);
    const commands = try r.readInt(u32);
    const compressed = try r.readInt(u32);
    if (padding > 1 or full > 1 or trailing > 1) return error.InvalidMode;
    if (limit < 32) return error.LimitExceeded;
    var image = try core.image.bmp_rle.decode(a, bytes[r.offset..], .{ .raster = .{
        .commands = .{ .padding = if (padding == 0) .require_zero else .preserve, .max_commands = commands, .max_bytes = compressed },
        .completion = if (full == 1) .require_full else .preserve_unwritten,
        .allow_trailing_bytes = trailing == 1,
        .max_index_bytes = @min(indices, limit - 32),
    } });
    defer image.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]usize{ image.width, image.height, image.indices.len, image.written_pixels, image.unwritten_pixels, image.commands, image.consumed_bytes, image.trailing_bytes }) |value| try int(a, &out, u32, @intCast(value));
    for (image.indices) |value| try int(a, &out, u16, value);
    return out.toOwnedSlice(a);
}
