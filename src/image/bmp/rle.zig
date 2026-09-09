const std = @import("std");
const structure = @import("structure.zig");
pub const commands = @import("rle_commands.zig");
pub const raster = @import("rle_raster.zig");
pub const Options = struct { structure: structure.Options = .{}, raster: raster.Options };
pub const Image = raster.Image;
/// BMP storage/header/palette policy stays in structure; no RGBA fill policy.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const view = try structure.inspect(bytes, options.structure);
    return decodeView(a, view, options.raster);
}
/// Requires a View from structure.inspect; header/palette rules stay there.
pub fn decodeView(a: std.mem.Allocator, view: structure.View, options: raster.Options) !Image {
    const format: commands.Format = switch (view.header.compression) {
        .rle4 => .rle4,
        .rle8 => .rle8,
        else => return error.UnsupportedBmpRleCompression,
    };
    return raster.decode(a, view.pixels, format, view.header.width, view.header.height, view.palette, options);
}
