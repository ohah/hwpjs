const std = @import("std");
const commands = @import("rle_commands.zig");
const Palette = @import("palette.zig").Palette;
pub const unwritten: u16 = 256;
pub const Completion = enum { preserve_unwritten, require_full };
pub const Options = struct {
    commands: commands.Options,
    completion: Completion,
    max_index_bytes: usize = 256 * 1024 * 1024,
    allow_trailing_bytes: bool = false,
};
pub const Image = struct {
    width: u32,
    height: u32,
    /// Owned top-down rows. 0..255 are indices; 256 is not a palette index.
    indices: []u16,
    written_pixels: usize,
    unwritten_pixels: usize,
    commands: usize,
    consumed_bytes: usize,
    trailing_bytes: usize,
    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        a.free(self.indices);
        self.* = undefined;
    }
};

pub fn decode(a: std.mem.Allocator, bytes: []const u8, format: commands.Format, width: u32, height: u32, palette: Palette, options: Options) !Image {
    if (width == 0 or height == 0) return error.InvalidBmpDimensions;
    var iterator = try commands.Iterator.init(bytes, format, options.commands);
    const pixels = @as(u64, width) * height;
    if (pixels > options.max_index_bytes / @sizeOf(u16)) return error.LimitExceeded;
    const out = try a.alloc(u16, @intCast(pixels));
    errdefer a.free(out);
    @memset(out, unwritten);
    var x: usize = 0;
    var y: usize = 0;
    var written: usize = 0;
    while (try iterator.next()) |command| {
        switch (command) {
            .run => |run| {
                if (y >= height or x > width or run.count > width - x) return error.InvalidBmpRlePosition;
                const start = (@as(usize, height) - 1 - y) * width + x;
                for (0..run.count) |i| {
                    const index = try run.index(@intCast(i));
                    try palette.validateIndex(index);
                    out[start + i] = index;
                }
                x += run.count;
                written += run.count;
            },
            .end_line => {
                if (y >= height) return error.InvalidBmpRlePosition;
                x = 0;
                y += 1;
            },
            .delta => |delta| {
                if (y >= height or x > width or delta.x > width - x or delta.y >= height - y) return error.InvalidBmpRlePosition;
                x += delta.x;
                y += delta.y;
            },
            .end_bitmap => {
                const trailing = bytes.len - iterator.reader.offset;
                if (!options.allow_trailing_bytes and trailing != 0) return error.TrailingBmpRleBytes;
                const missing = out.len - written;
                if (options.completion == .require_full and missing != 0) return error.IncompleteBmpRleRaster;
                return .{ .width = width, .height = height, .indices = out, .written_pixels = written, .unwritten_pixels = missing, .commands = iterator.count, .consumed_bytes = iterator.reader.offset, .trailing_bytes = trailing };
            },
        }
    }
    return error.MissingBmpRleEnd;
}
