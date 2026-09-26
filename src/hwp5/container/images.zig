const std = @import("std");
const png = @import("../../image/png/pixels.zig");
const png_rgba = @import("../../image/png/rgba.zig");
const jpeg = @import("jpeg_images.zig");
const bmp = @import("bmp_images.zig");
const bmp_profiles = @import("bmp_profiles.zig");
const gif = @import("gif_images.zig");
const pcx = @import("pcx_images.zig");
const wmf = @import("wmf_images.zig");
const isExtension = @import("extension.zig").is;
pub const Options = struct {
    pub const PngDeclaredJpeg = enum { reject, inspect_jpeg };
    pub const PngPixelOptions = struct { max_rgba_bytes: usize = 256 * 1024 * 1024 };

    gif: ?gif.Options = null,
    pcx: ?pcx.Options = null,
    wmf: ?wmf.Options = null,
    max_total_pcx_decoded_bytes: usize = (pcx.Options{}).max_decoded_bytes,
    max_total_wmf_bytes: usize = 256 * 1024 * 1024,
    max_total_png_post_iend_zero_bytes: usize = 64 * 1024 * 1024,
    max_total_gif_index_bytes: usize = (gif.Options{}).max_total_pixels,
    max_total_gif_codes: usize = (gif.Options{}).max_total_codes,
    max_total_gif_frames: usize = (gif.Options{}).max_frames,
    png: png.Options = .{},
    png_pixels: ?PngPixelOptions = null,
    max_total_png_rgba_bytes: usize = 256 * 1024 * 1024,
    jpeg: ?jpeg.Options = null,
    png_declared_jpeg: PngDeclaredJpeg = .reject,
    bmp: ?bmp.Options = null,
    bmp_profile: ?bmp_profiles.Options = null,
    max_total_bmp_profile_bytes: usize = 64 * 1024 * 1024,
    max_total_bmp_rgba_bytes: usize = 256 * 1024 * 1024,
    max_total_jpeg_rgb_bytes: usize = 256 * 1024 * 1024,
    max_binaries: usize = 100000,
    max_total_pixel_bytes: usize = 256 * 1024 * 1024,
};
pub const Report = struct {
    gif: gif.Report = .{},
    pcx: pcx.Report = .{},
    wmf: wmf.Report = .{},
    bmp_profile: bmp_profiles.Report = .{},
    bmp: bmp.Report = .{},
    jpeg: jpeg.Report = .{},
    binaries: usize = 0,
    png_images: usize = 0,
    png_rgba_images: usize = 0,
    png_rgba_bytes: usize = 0,
    unhandled_binaries: usize = 0,
    pixel_bytes: usize = 0,
    png_extension_disagreements: usize = 0,
    profile_images: usize = 0,
    color_deferred_images: usize = 0,
    ancillary_chunks_deferred: usize = 0,
    png_zlib_trailing_bytes: usize = 0,
    png_post_iend_zero_bytes: usize = 0,
    png_post_iend_zero_images: usize = 0,
    png_declared_jpeg_images: usize = 0,
    semantics_deferred: bool = true,
};
/// Scalar-only evidence; does not retain decoded BinData or image buffers.
pub const Budget = struct {
    options: Options,
    report: Report = .{},
    pub fn consume(self: *Budget, a: std.mem.Allocator, bytes: []const u8, extension_utf16: ?[]const u8) !void {
        if (self.options.bmp_profile != null and self.options.bmp == null) return error.InvalidBmpProfileSelection;
        if (self.report.binaries >= self.options.max_binaries) return error.LimitExceeded;
        var next = self.report;
        next.binaries += 1;
        const extension: []const u8 = extension_utf16 orelse &.{};
        const hinted = isPngExtension(extension);
        const signature = std.mem.startsWith(u8, bytes, @import("../../image/png/chunks.zig").signature);
        const jpeg_signature = std.mem.startsWith(u8, bytes, &.{ 255, 216 });
        const declared_png_jpeg = hinted and jpeg_signature and self.options.png_declared_jpeg == .inspect_jpeg;
        if (declared_png_jpeg and self.options.jpeg == null) return error.MissingJpegInspector;
        if ((!hinted or declared_png_jpeg) and !signature) {
            if (self.options.jpeg) |selected| {
                const jpeg_hint = isExtension(extension, "jpg") or isExtension(extension, "jpeg");
                if (jpeg_hint or jpeg_signature) {
                    if (next.jpeg.rgb_bytes > self.options.max_total_jpeg_rgb_bytes) return error.LimitExceeded;
                    var result = try jpeg.inspect(a, bytes, selected, self.options.max_total_jpeg_rgb_bytes - next.jpeg.rgb_bytes);
                    result.extension_disagreements = @intFromBool(!jpeg_hint and extension.len != 0);
                    next.jpeg = try next.jpeg.plus(result);
                    next.png_declared_jpeg_images = try add(next.png_declared_jpeg_images, @intFromBool(declared_png_jpeg));
                    self.report = next;
                    return;
                }
            }
            if (self.options.bmp) |selected| {
                const bmp_hint = isExtension(extension, "bmp");
                if (bmp_hint or std.mem.startsWith(u8, bytes, "BM")) {
                    if (next.bmp.rgba_bytes > self.options.max_total_bmp_rgba_bytes) return error.LimitExceeded;
                    const profile_remaining = if (self.options.bmp_profile != null) blk: {
                        if (next.bmp_profile.stored_bytes > self.options.max_total_bmp_profile_bytes) return error.LimitExceeded;
                        break :blk self.options.max_total_bmp_profile_bytes - next.bmp_profile.stored_bytes;
                    } else 0;
                    const profiled = try bmp.inspectProfiled(a, bytes, selected, self.options.max_total_bmp_rgba_bytes - next.bmp.rgba_bytes, self.options.bmp_profile, profile_remaining);
                    var result = profiled.bitmap;
                    result.extension_disagreements = @intFromBool(!bmp_hint and extension.len != 0);
                    next.bmp = try next.bmp.plus(result);
                    next.bmp_profile = try next.bmp_profile.plus(profiled.profile);
                    self.report = next;
                    return;
                }
            }
            if (self.options.gif) |selected| {
                const gif_hint = isExtension(extension, "gif");
                // Recognize the family so unsupported versions fail explicitly.
                if (gif_hint or std.mem.startsWith(u8, bytes, "GIF")) {
                    if (next.gif.index_bytes > self.options.max_total_gif_index_bytes or
                        next.gif.codes > self.options.max_total_gif_codes or
                        next.gif.frames > self.options.max_total_gif_frames) return error.LimitExceeded;
                    var result = try gif.inspect(a, bytes, selected, self.options.max_total_gif_index_bytes - next.gif.index_bytes, self.options.max_total_gif_codes - next.gif.codes, self.options.max_total_gif_frames - next.gif.frames);
                    result.extension_disagreements = @intFromBool(!gif_hint and extension.len != 0);
                    next.gif = try next.gif.plus(result);
                    self.report = next;
                    return;
                }
            }
            if (self.options.pcx) |selected| {
                const pcx_hint = isExtension(extension, "pcx");
                if (pcx_hint or @import("../../image/pcx/structure.zig").looksLike(bytes)) {
                    if (next.pcx.decoded_bytes > self.options.max_total_pcx_decoded_bytes) return error.LimitExceeded;
                    var result = try pcx.inspect(bytes, selected, self.options.max_total_pcx_decoded_bytes - next.pcx.decoded_bytes);
                    result.extension_disagreements = @intFromBool(!pcx_hint and extension.len != 0);
                    next.pcx = try next.pcx.plus(result);
                    self.report = next;
                    return;
                }
            }
            if (self.options.wmf) |selected| {
                const wmf_hint = isExtension(extension, "wmf");
                if (wmf_hint or @import("../../image/wmf/header.zig").looksLike(bytes)) {
                    if (next.wmf.bytes > self.options.max_total_wmf_bytes) return error.LimitExceeded;
                    var result = try wmf.inspect(bytes, selected, self.options.max_total_wmf_bytes - next.wmf.bytes);
                    result.extension_disagreements = @intFromBool(!wmf_hint and extension.len != 0);
                    next.wmf = try next.wmf.plus(result);
                    self.report = next;
                    return;
                }
            }
            next.unhandled_binaries = try add(next.unhandled_binaries, 1);
            self.report = next;
            return;
        }
        var options = self.options.png;
        if (next.pixel_bytes > self.options.max_total_pixel_bytes) return error.LimitExceeded;
        options.max_decoded_bytes = @min(options.max_decoded_bytes, self.options.max_total_pixel_bytes - next.pixel_bytes);
        if (options.structure.post_iend == .zero_padding) {
            if (next.png_post_iend_zero_bytes > self.options.max_total_png_post_iend_zero_bytes) return error.LimitExceeded;
            options.structure.post_iend.zero_padding = @min(options.structure.post_iend.zero_padding, self.options.max_total_png_post_iend_zero_bytes - next.png_post_iend_zero_bytes);
        }
        const result = if (self.options.png_pixels) |selected| blk: {
            if (next.png_rgba_bytes > self.options.max_total_png_rgba_bytes) return error.LimitExceeded;
            var image = try png_rgba.decode(a, bytes, .{
                .pixels = options,
                .max_rgba_bytes = @min(selected.max_rgba_bytes, self.options.max_total_png_rgba_bytes - next.png_rgba_bytes),
            });
            defer image.deinit(a);
            next.png_rgba_images = try add(next.png_rgba_images, 1);
            next.png_rgba_bytes = try add(next.png_rgba_bytes, image.raster.rgba.len);
            break :blk image.report;
        } else try png.inspect(a, bytes, options);
        next.png_images = try add(next.png_images, 1);
        next.pixel_bytes = try add(next.pixel_bytes, result.decoded_bytes);
        next.png_extension_disagreements = try add(next.png_extension_disagreements, @intFromBool(!hinted and extension.len != 0));
        next.profile_images = try add(next.profile_images, @intFromBool(result.profile != null));
        next.color_deferred_images = try add(next.color_deferred_images, @intFromBool(result.color_semantics_deferred));
        next.ancillary_chunks_deferred = try add(next.ancillary_chunks_deferred, result.structure.ancillary_chunks_deferred);
        next.png_zlib_trailing_bytes = try add(next.png_zlib_trailing_bytes, result.zlib_trailing_bytes);
        next.png_post_iend_zero_bytes = try add(next.png_post_iend_zero_bytes, result.structure.post_iend_zero_bytes);
        next.png_post_iend_zero_images = try add(next.png_post_iend_zero_images, @intFromBool(result.structure.post_iend_zero_bytes != 0));
        self.report = next;
    }
};
/// HWP format hint only; path/UTF-16 validity remains owned by container.paths.
fn isPngExtension(bytes: []const u8) bool {
    return isExtension(bytes, "png");
}
fn add(a: usize, b: usize) !usize {
    return std.math.add(usize, a, b) catch error.LimitExceeded;
}
