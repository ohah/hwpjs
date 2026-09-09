const std = @import("std");
const structure = @import("structure.zig");
const masks = @import("masks.zig");
pub const Options = struct {
    structure: structure.Options = .{},
    colour_management: enum { unmanaged },
    mask_scaling: masks.Scaling,
    max_rgba_bytes: usize = 256 * 1024 * 1024,
};
pub const Image = struct {
    width: u32,
    height: u32,
    /// Owned top-down RGBA channels; no compositing, colour management or gamma.
    rgba: []u8,
    metadata_deferred: bool = true,
    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        a.free(self.rgba);
        self.* = undefined;
    }
};
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const view = try structure.inspect(bytes, options.structure);
    if (!view.header.uncompressed()) return error.UnsupportedBmpPixelCompression;
    const pixels = @as(u64, view.header.width) * view.header.height;
    if (pixels > options.max_rgba_bytes / 4) return error.LimitExceeded;
    const out = try a.alloc(u8, @as(usize, @intCast(pixels)) * 4);
    errdefer a.free(out);
    const width: usize = view.header.width;
    const height: usize = view.header.height;
    for (0..height) |y| {
        const source_y = if (view.header.top_down) y else height - 1 - y;
        const row = view.pixels[source_y * view.stride ..][0..view.stride];
        for (0..width) |x| {
            const rgba: [4]u8 = switch (view.header.bit_count) {
                1 => try view.palette.rgba((row[x / 8] >> @as(u3, @intCast(7 - x % 8))) & 1),
                4 => try view.palette.rgba((row[x / 2] >> @as(u3, @intCast(if (x % 2 == 0) @as(u8, 4) else 0))) & 15),
                8 => try view.palette.rgba(row[x]),
                16 => view.channels.?.rgba(std.mem.readInt(u16, row[x * 2 ..][0..2], .little), options.mask_scaling),
                24 => .{ row[x * 3 + 2], row[x * 3 + 1], row[x * 3], 255 },
                32 => if (view.channels) |channels| channels.rgba(std.mem.readInt(u32, row[x * 4 ..][0..4], .little), options.mask_scaling) else .{ row[x * 4 + 2], row[x * 4 + 1], row[x * 4], 255 },
                else => return error.InvalidBmpBitCount,
            };
            @memcpy(out[(y * width + x) * 4 ..][0..4], &rgba);
        }
    }
    return .{ .width = view.header.width, .height = view.header.height, .rgba = out };
}
