const std = @import("std");
const png = @import("../../image/png/pixels.zig");
pub const Options = struct {
    png: png.Options = .{},
    max_binaries: usize = 100000,
    max_total_pixel_bytes: usize = 256 * 1024 * 1024,
};
pub const Report = struct {
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
/// Scalar-only evidence; does not retain decoded BinData or PNG borrowed views.
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
    if (bytes.len != 6) return false;
    for ("png", 0..) |c, i| {
        if (bytes[2 * i + 1] != 0 or std.ascii.toLower(bytes[2 * i]) != c) return false;
    }
    return true;
}
fn add(a: usize, b: usize) !usize {
    return std.math.add(usize, a, b) catch error.LimitExceeded;
}
