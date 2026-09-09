const std = @import("std");
const rle = @import("rle.zig");
const output = @import("pixel_image.zig");
pub const Options = struct {
    raster: rle.raster.Options,
    unwritten: output.Unwritten,
};
/// Consumes an already validated structure View, never reparses the BMP file.
pub fn decode(a: std.mem.Allocator, view: @import("structure.zig").View, options: Options, max_rgba_bytes: usize) !output.Image {
    const size = try output.byteCount(view.header.width, view.header.height, max_rgba_bytes);
    var indices = try rle.decodeView(a, view, options.raster);
    defer indices.deinit(a);
    if (options.unwritten == .reject and indices.unwritten_pixels != 0) return error.UnwrittenBmpRlePixels;
    const rgba = try a.alloc(u8, size);
    errdefer a.free(rgba);
    for (indices.indices, 0..) |index, i| {
        const colour: [4]u8 = if (index == rle.raster.unwritten) switch (options.unwritten) {
            .reject => return error.UnwrittenBmpRlePixels,
            .palette_zero => try view.palette.rgba(0),
            .transparent => .{ 0, 0, 0, 0 },
        } else try view.palette.rgba(@intCast(index));
        @memcpy(rgba[i * 4 ..][0..4], &colour);
    }
    return .{ .width = indices.width, .height = indices.height, .rgba = rgba, .rle = .{
        .unwritten = options.unwritten,
        .written_pixels = indices.written_pixels,
        .unwritten_pixels = indices.unwritten_pixels,
        .commands = indices.commands,
        .consumed_bytes = indices.consumed_bytes,
        .trailing_bytes = indices.trailing_bytes,
    } };
}
