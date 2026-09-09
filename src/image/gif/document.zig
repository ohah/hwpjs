const std = @import("std");
pub const blocks = @import("blocks.zig");
pub const raster = @import("raster.zig");
pub const Options = struct {
    structure: blocks.Options = .{},
    max_frames: usize = 10000,
    max_total_pixels: usize = 256 * 1024 * 1024,
    max_total_codes: usize = 256 * 1024 * 1024,
};
pub const Frame = struct { image: blocks.Image, raster: raster.Raster };
/// Owns the frame list and indices; all original metadata/palettes borrow input bytes.
pub const Document = struct {
    header: @import("header.zig").Header,
    frames: []Frame,
    blocks: usize,
    sub_blocks: usize,
    total_pixels: usize,
    total_codes: usize,
    comments: usize,
    applications: usize,
    plain_texts: usize,
    unresolved_color_frames: usize,
    reserved_disposals: usize,
    consumed_bytes: usize,
    trailing_bytes: usize,
    /// Plain-text rendering, application semantics, background and frame compositing remain separate.
    rendering_deferred: bool = true,
    pub fn deinit(self: *Document, a: std.mem.Allocator) void {
        for (self.frames) |*frame| frame.raster.deinit(a);
        a.free(self.frames);
        self.* = undefined;
    }
};
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Document {
    var iterator = try blocks.Iterator.init(bytes, options.structure);
    var frames: std.ArrayList(Frame) = .empty;
    errdefer {
        for (frames.items) |*frame| frame.raster.deinit(a);
        frames.deinit(a);
    }
    var pixels: usize = 0;
    var codes: usize = 0;
    var comments: usize = 0;
    var applications: usize = 0;
    var plain_texts: usize = 0;
    var unresolved: usize = 0;
    var reserved_disposals: usize = 0;
    while (try iterator.next()) |block| switch (block) {
        .image => |image| {
            if (frames.items.len == options.max_frames) return error.LimitExceeded;
            var decoded = try raster.decode(a, image, iterator.header.global_palette, .{ .max_pixels = options.max_total_pixels - pixels, .max_codes = options.max_total_codes - codes });
            errdefer decoded.deinit(a);
            try frames.append(a, .{ .image = image, .raster = decoded });
            pixels += decoded.indices.len;
            codes += decoded.lzw.codes;
            unresolved += @intFromBool(!decoded.colors_resolved);
        },
        .control => |control| {
            reserved_disposals += @intFromBool(((control.flags >> 2) & 7) >= 4);
        },
        .comment => {
            comments += 1;
        },
        .application => {
            applications += 1;
        },
        .text => {
            plain_texts += 1;
        },
    };
    return .{ .header = iterator.header, .frames = try frames.toOwnedSlice(a), .blocks = iterator.blocks, .sub_blocks = iterator.sub_blocks, .total_pixels = pixels, .total_codes = codes, .comments = comments, .applications = applications, .plain_texts = plain_texts, .unresolved_color_frames = unresolved, .reserved_disposals = reserved_disposals, .consumed_bytes = iterator.reader.offset, .trailing_bytes = bytes.len - iterator.reader.offset };
}
