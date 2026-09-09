const std = @import("std");
const core = @import("hwpjs");

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const rgb = try r.readInt(u32);
    const adobe = try r.readInt(u32);
    const icc = try r.readInt(u32);
    const method = try r.readInt(u8);
    if (method > 1) return error.InvalidInterpolationMethod;
    const maximum_samples = try r.readInt(u32);
    const frame = try @import("jpeg-progressive-frame-probe.zig").readOptions(&r, limit);
    var result = try core.image.jpeg_jfif_progressive_rgb.decode(a, bytes[r.offset..], .{
        .samples = .{ .frame = frame, .max_samples = @min(maximum_samples, limit / 2) },
        .render = .{ .upsampling = if (method == 0) .nearest else .bilinear, .colour_management = .unmanaged, .max_rgb_bytes = @min(rgb, limit), .max_adobe_markers = adobe, .max_icc_bytes = icc },
    });
    defer result.deinit(a);
    const image = result.image;
    const history = result.progression;
    const levels = std.mem.sliceAsBytes(result.levels[0..result.components]);
    if (levels.len > limit) return error.LimitExceeded;
    var out = try @import("jpeg-rgb-probe.zig").serialize(a, image.raster, &.{ image.jfif_version, @intCast(image.adobe_headers), image.icc_chunks, @intCast(image.application_markers), @intCast(image.unchecked_compressed_thumbnails), @intCast(image.unknown_extensions), @intFromBool(image.metadata_deferred), result.components, @intCast(history.scans), @intCast(history.unseen_coefficients), @intCast(history.partial_coefficients), @intCast(history.full_coefficients) }, limit - levels.len);
    errdefer a.free(out);
    const start = out.len;
    out = try a.realloc(out, start + levels.len);
    @memcpy(out[start..], levels);
    return out;
}
