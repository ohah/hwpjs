const std = @import("std");
const blocks = @import("blocks.zig");
const lzw = @import("lzw.zig");
pub const Options = struct { max_pixels: usize = 256 * 1024 * 1024, max_codes: usize = 256 * 1024 * 1024 };
pub const Raster = struct {
    indices: []u8,
    lzw: lzw.Evidence,
    colors_resolved: bool,
    pub fn deinit(self: *Raster, a: std.mem.Allocator) void {
        a.free(self.indices);
        self.* = undefined;
    }
};
const Sink = struct {
    output: []u8,
    width: usize,
    height: usize,
    interlace: bool,
    palette_entries: usize,
    written: usize = 0,
    x: usize = 0,
    y: usize = 0,
    pass: usize = 0,
    pub fn write(self: *Sink, index: u8) !void {
        if (self.written == self.output.len) return error.ExcessGifPixels;
        if (self.palette_entries != 0 and index >= self.palette_entries) return error.InvalidGifPaletteIndex;
        self.output[self.y * self.width + self.x] = index;
        self.written += 1;
        self.x += 1;
        if (self.x == self.width) {
            self.x = 0;
            if (!self.interlace) {
                self.y += 1;
            } else {
                const starts = [_]usize{ 0, 4, 2, 1 };
                const steps = [_]usize{ 8, 8, 4, 2 };
                self.y += steps[self.pass];
                while (self.y >= self.height and self.pass < 3) {
                    self.pass += 1;
                    self.y = starts[self.pass];
                }
            }
        }
    }
};
/// Image comes from blocks.Iterator. Palette absence is preserved, not invented.
pub fn decode(a: std.mem.Allocator, image: blocks.Image, global_palette: []const u8, options: Options) !Raster {
    const pixels = @as(u64, image.width) * image.height;
    if (pixels > options.max_pixels) return error.LimitExceeded;
    const palette = if (image.local_palette.len != 0) image.local_palette else global_palette;
    if (palette.len % 3 != 0 or palette.len > 768) return error.InvalidGifPaletteSize;
    const indices = try a.alloc(u8, @intCast(pixels));
    errdefer a.free(indices);
    var sink: Sink = .{ .output = indices, .width = image.width, .height = image.height, .interlace = image.flags & 64 != 0, .palette_entries = palette.len / 3 };
    const evidence = try lzw.decode(image.data, image.minimum_code_size, options.max_codes, &sink);
    if (sink.written != indices.len) return error.IncompleteGifPixels;
    return .{ .indices = indices, .lzw = evidence, .colors_resolved = palette.len != 0 };
}
