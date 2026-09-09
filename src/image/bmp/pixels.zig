const std = @import("std");
const structure = @import("structure.zig");
const masks = @import("masks.zig");
const output = @import("pixel_image.zig");
const rle = @import("rle_rgba.zig");
pub const Options = struct {
    structure: structure.Options = .{},
    colour_management: enum { unmanaged },
    mask_scaling: masks.Scaling,
    max_rgba_bytes: usize = 256 * 1024 * 1024,
    rle: ?rle.Options = null,
};
pub const Image = output.Image;
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const view = try structure.inspect(bytes, options.structure);
    return decodeView(a, view, options);
}
/// Requires structure.inspect's View. The structure options are already applied.
pub fn decodeView(a: std.mem.Allocator, view: structure.View, options: Options) !Image {
    if (!view.header.uncompressed()) {
        if (options.rle) |selected| switch (view.header.compression) {
            .rle4, .rle8 => return rle.decode(a, view, selected, options.max_rgba_bytes),
            else => {},
        };
        return error.UnsupportedBmpPixelCompression;
    }
    const out = try a.alloc(u8, try output.byteCount(view.header.width, view.header.height, options.max_rgba_bytes));
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
