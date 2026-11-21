//! Bounded raster structure inspection, not full pixel decoding or EXIF orientation.
const std = @import("std");
pub const max_document_bytes = 64 * 1024 * 1024;
pub const max_image_bytes = 8 * 1024 * 1024;
pub const Media = struct { mime: []const u8, extension: []const u8 };
pub const PixelSize = struct { width: u32, height: u32 };
pub const Raster = struct { media: Media, pixels: PixelSize };

/// Retain the replacement/media API; dimensions are a separate creation input.
pub fn inspectImage(bytes: []const u8, max_bytes: usize) !Media {
    return (try inspectRaster(bytes, max_bytes)).media;
}
pub fn inspectRaster(bytes: []const u8, max_bytes: usize) !Raster {
    if (bytes.len == 0 or bytes.len > @min(max_bytes, max_image_bytes)) return error.ImageByteLimitExceeded;
    if (std.mem.startsWith(u8, bytes, @import("png/chunks.zig").signature)) {
        const report = try @import("png/structure.zig").inspect(bytes, .{});
        return .{ .media = .{ .mime = "image/png", .extension = "png" }, .pixels = .{ .width = report.header.width, .height = report.header.height } };
    }
    if (std.mem.startsWith(u8, bytes, &.{ 0xff, 0xd8 })) {
        const report = try @import("jpeg/structure.zig").inspect(bytes, .{});
        return .{ .media = .{ .mime = "image/jpeg", .extension = "jpg" }, .pixels = .{ .width = report.width, .height = report.effective_height } };
    }
    return error.UnsupportedReplacementImageFormat;
}
