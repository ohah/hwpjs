const std = @import("std");
const png = @import("../../image/png/pixels.zig");
const jpeg = @import("jpeg_images.zig");
const bmp = @import("bmp_images.zig");
pub const Options = struct {
    png: png.Options = .{},
    jpeg: ?jpeg.Options = null,
    bmp: ?bmp.Options = null,
    max_total_bmp_rgba_bytes: usize = 256 * 1024 * 1024,
    max_total_jpeg_rgb_bytes: usize = 256 * 1024 * 1024,
    max_binaries: usize = 100000,
    max_total_pixel_bytes: usize = 256 * 1024 * 1024,
};
pub const Report = struct {
    bmp: bmp.Report = .{},
    jpeg: jpeg.Report = .{},
    binaries: usize = 0,
    png_images: usize = 0,
    unhandled_binaries: usize = 0,
    pixel_bytes: usize = 0,
    png_extension_disagreements: usize = 0,
    profile_images: usize = 0,
    color_deferred_images: usize = 0,
    ancillary_chunks_deferred: usize = 0,
    png_zlib_trailing_bytes: usize = 0,
    semantics_deferred: bool = true,
};
/// Scalar-only evidence; does not retain decoded BinData or image buffers.
pub const Budget = struct {
    options: Options,
    report: Report = .{},
    pub fn consume(self: *Budget, a: std.mem.Allocator, bytes: []const u8, extension_utf16: ?[]const u8) !void {
        if (self.report.binaries >= self.options.max_binaries) return error.LimitExceeded;
        var next = self.report;
        next.binaries += 1;
        const extension: []const u8 = extension_utf16 orelse &.{};
        const hinted = isPngExtension(extension);
        const signature = std.mem.startsWith(u8, bytes, @import("../../image/png/chunks.zig").signature);
        if (!hinted and !signature) {
            if (self.options.jpeg) |selected| {
                const jpeg_hint = isExtension(extension, "jpg") or isExtension(extension, "jpeg");
                if (jpeg_hint or std.mem.startsWith(u8, bytes, &.{ 255, 216 })) {
                    if (next.jpeg.rgb_bytes > self.options.max_total_jpeg_rgb_bytes) return error.LimitExceeded;
                    var result = try jpeg.inspect(a, bytes, selected, self.options.max_total_jpeg_rgb_bytes - next.jpeg.rgb_bytes);
                    result.extension_disagreements = @intFromBool(!jpeg_hint and extension.len != 0);
                    next.jpeg = try next.jpeg.plus(result);
                    self.report = next;
                    return;
                }
            }
            if (self.options.bmp) |selected| {
                const bmp_hint = isExtension(extension, "bmp");
                if (bmp_hint or std.mem.startsWith(u8, bytes, "BM")) {
                    if (next.bmp.rgba_bytes > self.options.max_total_bmp_rgba_bytes) return error.LimitExceeded;
                    var result = try bmp.inspect(a, bytes, selected, self.options.max_total_bmp_rgba_bytes - next.bmp.rgba_bytes);
                    result.extension_disagreements = @intFromBool(!bmp_hint and extension.len != 0);
                    next.bmp = try next.bmp.plus(result);
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
        const result = try png.inspect(a, bytes, options);
        next.png_images = try add(next.png_images, 1);
        next.pixel_bytes = try add(next.pixel_bytes, result.decoded_bytes);
        next.png_extension_disagreements = try add(next.png_extension_disagreements, @intFromBool(!hinted and extension.len != 0));
        next.profile_images = try add(next.profile_images, @intFromBool(result.profile != null));
        next.color_deferred_images = try add(next.color_deferred_images, @intFromBool(result.color_semantics_deferred));
        next.ancillary_chunks_deferred = try add(next.ancillary_chunks_deferred, result.structure.ancillary_chunks_deferred);
        next.png_zlib_trailing_bytes = try add(next.png_zlib_trailing_bytes, result.zlib_trailing_bytes);
        self.report = next;
    }
};
/// HWP format hint only; path/UTF-16 validity remains owned by container.paths.
fn isPngExtension(bytes: []const u8) bool {
    return isExtension(bytes, "png");
}
fn isExtension(bytes: []const u8, ascii: []const u8) bool {
    if (bytes.len != 2 * ascii.len) return false;
    for (ascii, 0..) |c, i| {
        if (bytes[2 * i + 1] != 0 or std.ascii.toLower(bytes[2 * i]) != c) return false;
    }
    return true;
}
fn add(a: usize, b: usize) !usize {
    return std.math.add(usize, a, b) catch error.LimitExceeded;
}
